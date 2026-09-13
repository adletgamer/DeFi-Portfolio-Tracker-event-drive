import { config } from "../config.js";
import { createLogger } from "./logger.js";
import { RawChainEvent } from "../domain/events.js";

const log = createLogger("rpc");

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface KnownToken {
  address: string;
  symbol: string;
  decimals: number;
}

const MOCK_TOKENS: KnownToken[] = [
  {
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    symbol: "USDC",
    decimals: 6,
  },
  {
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    symbol: "WETH",
    decimals: 18,
  },
  {
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    symbol: "DAI",
    decimals: 18,
  },
];

const COUNTERPARTIES = [
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 router
  "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch router
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // 0x exchange proxy
];

/**
 * Deterministically generate a batch of ERC-20 transfer events for the given
 * wallets. `round` advances the block window so successive polls yield fresh,
 * non-overlapping events (mimicking new on-chain activity between cron runs).
 */
export function generateMockEvents(
  wallets: string[],
  round: number
): RawChainEvent[] {
  const events: RawChainEvent[] = [];
  const baseBlock = 19_000_000 + round * 100;
  const baseTs = 1_700_000_000 + round * 720;

  wallets.forEach((wallet, wIdx) => {
    // Two transfers per wallet per round: one inbound swap, one outbound.
    const token = MOCK_TOKENS[(round + wIdx) % MOCK_TOKENS.length];
    const token2 = MOCK_TOKENS[(round + wIdx + 1) % MOCK_TOKENS.length];
    const counterparty = COUNTERPARTIES[(round + wIdx) % COUNTERPARTIES.length];

    const inAmount = (BigInt(round + 1) * 1000n * 10n ** BigInt(token.decimals)).toString();
    const outAmount = (
      BigInt(round + 1) *
      3n *
      10n ** BigInt(Math.max(token2.decimals - 1, 0))
    ).toString();

    events.push({
      wallet,
      token: token.address,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      from: counterparty,
      to: wallet,
      value: inAmount,
      txHash: `0x${(round * 1000 + wIdx * 2).toString(16).padStart(64, "0")}`,
      blockNumber: baseBlock + wIdx * 2,
      logIndex: 0,
      timestamp: baseTs + wIdx * 12,
    });

    events.push({
      wallet,
      token: token2.address,
      tokenSymbol: token2.symbol,
      tokenDecimals: token2.decimals,
      from: wallet,
      to: counterparty,
      value: outAmount,
      txHash: `0x${(round * 1000 + wIdx * 2 + 1).toString(16).padStart(64, "0")}`,
      blockNumber: baseBlock + wIdx * 2 + 1,
      logIndex: 1,
      timestamp: baseTs + wIdx * 12 + 6,
    });
  });

  return events;
}

async function jsonRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) {
    throw new Error(`RPC ${method} error: ${body.error.message}`);
  }
  return body.result as T;
}

function padAddressTopic(address: string): string {
  return "0x" + "0".repeat(24) + address.toLowerCase().replace(/^0x/, "");
}

async function fetchHttpEventsForWallet(
  wallet: string,
  lookbackBlocks: number
): Promise<RawChainEvent[]> {
  const latestHex = await jsonRpc<string>("eth_blockNumber", []);
  const latest = parseInt(latestHex, 16);
  const fromBlock = "0x" + Math.max(latest - lookbackBlocks, 0).toString(16);
  const walletTopic = padAddressTopic(wallet);

  interface RpcLog {
    address: string;
    topics: string[];
    data: string;
    transactionHash: string;
    blockNumber: string;
    logIndex: string;
  }

  const [incoming, outgoing] = await Promise.all([
    jsonRpc<RpcLog[]>("eth_getLogs", [
      { fromBlock, toBlock: "latest", topics: [TRANSFER_TOPIC, null, walletTopic] },
    ]),
    jsonRpc<RpcLog[]>("eth_getLogs", [
      { fromBlock, toBlock: "latest", topics: [TRANSFER_TOPIC, walletTopic] },
    ]),
  ]);

  const topicToAddress = (t: string) => "0x" + t.slice(t.length - 40);

  return [...incoming, ...outgoing].map((l) => ({
    wallet: wallet.toLowerCase(),
    token: l.address.toLowerCase(),
    tokenSymbol: l.address.slice(2, 8).toUpperCase(),
    tokenDecimals: 18,
    from: topicToAddress(l.topics[1]),
    to: topicToAddress(l.topics[2]),
    value: BigInt(l.data === "0x" ? "0x0" : l.data).toString(),
    txHash: l.transactionHash.toLowerCase(),
    blockNumber: parseInt(l.blockNumber, 16),
    logIndex: parseInt(l.logIndex, 16),
    timestamp: Math.floor(Date.now() / 1000),
  }));
}

export interface RpcSource {
  getEvents(wallets: string[], round: number): Promise<RawChainEvent[]>;
}

export function createRpcSource(): RpcSource {
  if (config.rpcMode === "http") {
    log.info("Using HTTP JSON-RPC source", { rpcUrl: config.rpcUrl });
    return {
      async getEvents(wallets) {
        const all: RawChainEvent[] = [];
        for (const wallet of wallets) {
          try {
            const events = await fetchHttpEventsForWallet(wallet, 500);
            all.push(...events);
          } catch (err) {
            log.error("Failed to fetch events for wallet", {
              wallet,
              error: (err as Error).message,
            });
          }
        }
        return all;
      },
    };
  }

  log.info("Using deterministic mock RPC source");
  return {
    async getEvents(wallets, round) {
      return generateMockEvents(wallets, round);
    },
  };
}
