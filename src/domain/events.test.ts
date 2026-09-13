import {
  buildPortfolio,
  eventId,
  eventSk,
  normalizeEvent,
  RawChainEvent,
} from "./events.js";
import { generateMockEvents } from "../lib/rpc.js";

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function raw(overrides: Partial<RawChainEvent> = {}): RawChainEvent {
  return {
    wallet: WALLET,
    token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    from: OTHER,
    to: WALLET,
    value: "1500000", // 1.5 USDC
    txHash: "0xabc",
    blockNumber: 100,
    logIndex: 0,
    timestamp: 1700000000,
    ...overrides,
  };
}

describe("normalizeEvent", () => {
  it("marks inbound transfers as 'in' with correct decimal scaling", () => {
    const n = normalizeEvent(raw());
    expect(n.direction).toBe("in");
    expect(n.counterparty).toBe(OTHER);
    expect(n.amount).toBe("1500000");
    expect(n.amountDecimal).toBeCloseTo(1.5, 6);
  });

  it("marks outbound transfers as 'out'", () => {
    const n = normalizeEvent(raw({ from: WALLET, to: OTHER }));
    expect(n.direction).toBe("out");
    expect(n.counterparty).toBe(OTHER);
  });

  it("marks self transfers as 'self'", () => {
    const n = normalizeEvent(raw({ from: WALLET, to: WALLET }));
    expect(n.direction).toBe("self");
  });

  it("lowercases addresses and hashes", () => {
    const n = normalizeEvent(
      raw({ wallet: WALLET.toUpperCase(), txHash: "0xABC" })
    );
    expect(n.wallet).toBe(WALLET);
    expect(n.txHash).toBe("0xabc");
  });

  it("scales 18-decimal amounts correctly", () => {
    const n = normalizeEvent(
      raw({ tokenDecimals: 18, value: "2500000000000000000" })
    );
    expect(n.amountDecimal).toBeCloseTo(2.5, 12);
  });
});

describe("keys", () => {
  it("produces a stable event id", () => {
    expect(eventId({ wallet: WALLET, txHash: "0xABC", logIndex: 2 })).toBe(
      `${WALLET}:0xabc:2`
    );
  });

  it("produces sort keys ordered by block then log", () => {
    const a = eventSk({ blockNumber: 100, logIndex: 0, txHash: "0xa" });
    const b = eventSk({ blockNumber: 100, logIndex: 1, txHash: "0xa" });
    const c = eventSk({ blockNumber: 101, logIndex: 0, txHash: "0xa" });
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });
});

describe("buildPortfolio", () => {
  it("nets inflows against outflows per token", () => {
    const events = [
      normalizeEvent(raw({ from: OTHER, to: WALLET, value: "5000000" })),
      normalizeEvent(
        raw({
          from: WALLET,
          to: OTHER,
          value: "2000000",
          txHash: "0xdef",
          logIndex: 1,
        })
      ),
    ];
    const p = buildPortfolio(WALLET, events);
    expect(p.positions).toHaveLength(1);
    expect(p.positions[0].tokenSymbol).toBe("USDC");
    expect(p.positions[0].netAmount).toBe("3000000");
    expect(p.positions[0].netAmountDecimal).toBeCloseTo(3, 6);
    expect(p.eventCount).toBe(2);
  });

  it("ignores self transfers in the net balance", () => {
    const events = [normalizeEvent(raw({ from: WALLET, to: WALLET }))];
    const p = buildPortfolio(WALLET, events);
    expect(p.positions[0].netAmount).toBe("0");
  });
});

describe("generateMockEvents", () => {
  it("is deterministic for a given round", () => {
    const a = generateMockEvents([WALLET], 3);
    const b = generateMockEvents([WALLET], 3);
    expect(a).toEqual(b);
  });

  it("produces non-overlapping events across rounds", () => {
    const r0 = generateMockEvents([WALLET], 0).map((e) => e.txHash);
    const r1 = generateMockEvents([WALLET], 1).map((e) => e.txHash);
    for (const hash of r0) {
      expect(r1).not.toContain(hash);
    }
  });

  it("emits both inbound and outbound transfers per wallet", () => {
    const events = generateMockEvents([WALLET], 0);
    const normalized = events.map(normalizeEvent);
    expect(normalized.some((e) => e.direction === "in")).toBe(true);
    expect(normalized.some((e) => e.direction === "out")).toBe(true);
  });
});
