/**
 * Domain types shared across the pipeline.
 *
 * A `RawChainEvent` is what the poller reads from the chain (or the mock RPC)
 * and enqueues. A `NormalizedEvent` is the canonical, deduplicated record the
 * normalizer writes to DynamoDB and the API serves.
 */

export interface RawChainEvent {
  /** Wallet being watched that this event concerns (lowercased 0x address). */
  wallet: string;
  /** ERC-20 token contract address (lowercased 0x address). */
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  from: string;
  to: string;
  /** Transfer amount as an integer string in the token's smallest unit. */
  value: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  /** Unix seconds. */
  timestamp: number;
}

export type TransferDirection = "in" | "out" | "self";

export interface NormalizedEvent {
  wallet: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  direction: TransferDirection;
  counterparty: string;
  /** Raw integer amount in smallest unit. */
  amount: string;
  /** Human-readable amount scaled by token decimals. */
  amountDecimal: number;
  eventType: "erc20_transfer";
}

/** Stable, deterministic identifier for a chain event (used for dedupe). */
export function eventId(e: {
  wallet: string;
  txHash: string;
  logIndex: number;
}): string {
  return `${e.wallet.toLowerCase()}:${e.txHash.toLowerCase()}:${e.logIndex}`;
}

/** DynamoDB partition key for a wallet. */
export function walletPk(wallet: string): string {
  return `WALLET#${wallet.toLowerCase()}`;
}

/** DynamoDB sort key that keeps a wallet's events ordered by block/log. */
export function eventSk(e: {
  blockNumber: number;
  logIndex: number;
  txHash: string;
}): string {
  const block = e.blockNumber.toString().padStart(12, "0");
  const log = e.logIndex.toString().padStart(6, "0");
  return `EVENT#${block}#${log}#${e.txHash.toLowerCase()}`;
}

function scaleAmount(value: string, decimals: number): number {
  // Avoid BigInt precision loss for display; exact integer amount is kept in `amount`.
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const frac = decimals > 0 ? padded.slice(padded.length - decimals) : "";
  const num = Number(`${whole}.${frac || "0"}`);
  return negative ? -num : num;
}

/**
 * Convert a raw chain event into the canonical record, deriving the transfer
 * direction relative to the watched wallet.
 */
export function normalizeEvent(raw: RawChainEvent): NormalizedEvent {
  const wallet = raw.wallet.toLowerCase();
  const from = raw.from.toLowerCase();
  const to = raw.to.toLowerCase();

  let direction: TransferDirection;
  let counterparty: string;
  if (from === wallet && to === wallet) {
    direction = "self";
    counterparty = wallet;
  } else if (from === wallet) {
    direction = "out";
    counterparty = to;
  } else if (to === wallet) {
    direction = "in";
    counterparty = from;
  } else {
    // Event does not actually involve the wallet; treat as inbound observation.
    direction = "in";
    counterparty = from;
  }

  return {
    wallet,
    txHash: raw.txHash.toLowerCase(),
    logIndex: raw.logIndex,
    blockNumber: raw.blockNumber,
    timestamp: raw.timestamp,
    token: raw.token.toLowerCase(),
    tokenSymbol: raw.tokenSymbol,
    tokenDecimals: raw.tokenDecimals,
    direction,
    counterparty,
    amount: raw.value,
    amountDecimal: scaleAmount(raw.value, raw.tokenDecimals),
    eventType: "erc20_transfer",
  };
}

export interface TokenPosition {
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Net signed amount in smallest unit (as string to preserve precision). */
  netAmount: string;
  netAmountDecimal: number;
  inflowDecimal: number;
  outflowDecimal: number;
  eventCount: number;
}

export interface Portfolio {
  wallet: string;
  positions: TokenPosition[];
  eventCount: number;
  generatedAt: string;
}

/**
 * Aggregate normalized events into per-token net positions for a wallet.
 * Net = inflows - outflows (self-transfers are ignored for balance).
 */
export function buildPortfolio(
  wallet: string,
  events: NormalizedEvent[]
): Portfolio {
  const byToken = new Map<
    string,
    {
      symbol: string;
      decimals: number;
      net: bigint;
      inflow: number;
      outflow: number;
      count: number;
    }
  >();

  for (const e of events) {
    const key = e.token;
    const cur =
      byToken.get(key) ??
      {
        symbol: e.tokenSymbol,
        decimals: e.tokenDecimals,
        net: 0n,
        inflow: 0,
        outflow: 0,
        count: 0,
      };

    const amount = BigInt(e.amount);
    if (e.direction === "in") {
      cur.net += amount;
      cur.inflow += e.amountDecimal;
    } else if (e.direction === "out") {
      cur.net -= amount;
      cur.outflow += e.amountDecimal;
    }
    cur.count += 1;
    byToken.set(key, cur);
  }

  const positions: TokenPosition[] = [...byToken.entries()]
    .map(([token, v]) => ({
      token,
      tokenSymbol: v.symbol,
      tokenDecimals: v.decimals,
      netAmount: v.net.toString(),
      netAmountDecimal: scaleAmount(v.net.toString(), v.decimals),
      inflowDecimal: v.inflow,
      outflowDecimal: v.outflow,
      eventCount: v.count,
    }))
    .sort((a, b) => a.tokenSymbol.localeCompare(b.tokenSymbol));

  return {
    wallet: wallet.toLowerCase(),
    positions,
    eventCount: events.length,
    generatedAt: new Date().toISOString(),
  };
}
