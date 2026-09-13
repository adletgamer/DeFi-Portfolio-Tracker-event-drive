import { runPoll } from "../handlers/poller.js";
import { ensureQueue } from "../lib/queue.js";
import { createLogger } from "../lib/logger.js";
import { config } from "../config.js";
import { waitForPort } from "./wait.js";
import { isMain } from "./is-main.js";

const log = createLogger("run-poller");

/**
 * One-shot local invocation of the poller Lambda. The round is derived from the
 * current time so repeated manual runs generate fresh mock events.
 */
async function main(): Promise<void> {
  if (config.sqsEndpoint) {
    await waitForPort(config.sqsEndpoint, "ElasticMQ (SQS)");
  }
  await ensureQueue();
  const round = Number(process.argv[2] ?? Math.floor(Date.now() / 60000) % 1000);
  const result = await runPoll(round);
  log.info("Poller run finished", result);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    log.error("Poller run failed", { error: (err as Error).message });
    process.exit(1);
  });
}
