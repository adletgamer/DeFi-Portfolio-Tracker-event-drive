import { createLogger } from "../lib/logger.js";
import { createRpcSource } from "../lib/rpc.js";
import { enqueueEvents } from "../lib/queue.js";
import { config } from "../config.js";

const log = createLogger("poller");

export interface PollResult {
  wallets: number;
  eventsRead: number;
  eventsEnqueued: number;
}

/**
 * Poller Lambda: invoked on a schedule (EventBridge cron in AWS). Reads recent
 * on-chain events for the watched wallets via HTTPS RPC and enqueues them for
 * normalization.
 */
export async function runPoll(round = 0): Promise<PollResult> {
  const source = createRpcSource();
  const wallets = config.watchedWallets;

  log.info("Polling wallets", { wallets: wallets.length, round });
  const events = await source.getEvents(wallets, round);
  const enqueued = await enqueueEvents(events);

  log.info("Poll complete", {
    eventsRead: events.length,
    eventsEnqueued: enqueued,
  });

  return {
    wallets: wallets.length,
    eventsRead: events.length,
    eventsEnqueued: enqueued,
  };
}

/** AWS Lambda entrypoint (EventBridge scheduled event). */
export async function handler(event?: { round?: number }): Promise<PollResult> {
  return runPoll(event?.round ?? 0);
}
