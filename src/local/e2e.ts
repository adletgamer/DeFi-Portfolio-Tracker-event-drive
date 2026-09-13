import { bootstrap } from "./bootstrap.js";
import { runPoll } from "../handlers/poller.js";
import { receiveEvents, deleteMessage } from "../lib/queue.js";
import { normalizeBatch } from "../handlers/normalizer.js";
import { getEventsForWallet } from "../lib/store.js";
import { buildPortfolio } from "../domain/events.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { sleep } from "./wait.js";

const log = createLogger("e2e");

/**
 * Drive the whole pipeline without the long-running services:
 *   poll -> SQS -> drain queue -> normalize -> DynamoDB -> query + portfolio.
 * Exits non-zero if any stage produces no data, so it doubles as a smoke test.
 */
async function main(): Promise<void> {
  log.info("=== E2E: bootstrap ===");
  await bootstrap();

  log.info("=== E2E: poll (enqueue events) ===");
  const poll = await runPoll(0);
  if (poll.eventsEnqueued === 0) {
    throw new Error("Poller enqueued 0 events");
  }

  log.info("=== E2E: drain queue + normalize ===");
  let totalWritten = 0;
  let totalProcessed = 0;
  // Drain until the queue is empty for a couple of consecutive polls.
  let emptyStreak = 0;
  while (emptyStreak < 2) {
    const messages = await receiveEvents(10, 1);
    if (messages.length === 0) {
      emptyStreak += 1;
      await sleep(200);
      continue;
    }
    emptyStreak = 0;
    const result = await normalizeBatch(messages.map((m) => m.event));
    for (const m of messages) {
      await deleteMessage(m.receiptHandle);
    }
    totalProcessed += result.processed;
    totalWritten += result.written;
  }
  if (totalProcessed === 0) {
    throw new Error("Normalizer processed 0 messages");
  }

  log.info("=== E2E: query DynamoDB ===");
  const wallet = config.watchedWallets[0];
  const events = await getEventsForWallet(wallet);
  if (events.length === 0) {
    throw new Error(`No events stored for wallet ${wallet}`);
  }

  const portfolio = buildPortfolio(wallet, events);

  log.info("=== E2E SUCCESS ===", {
    enqueued: poll.eventsEnqueued,
    processed: totalProcessed,
    written: totalWritten,
    wallet,
    storedEvents: events.length,
    positions: portfolio.positions.length,
  });

  console.log("\n----- Portfolio summary for " + wallet + " -----");
  console.log(JSON.stringify(portfolio, null, 2));
  console.log("\n----- Latest events -----");
  console.log(JSON.stringify(events.slice(0, 4), null, 2));
}

main().catch((err) => {
  log.error("E2E FAILED", { error: (err as Error).message });
  process.exit(1);
});
