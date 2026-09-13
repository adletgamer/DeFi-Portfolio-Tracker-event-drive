import { bootstrap } from "./bootstrap.js";
import { startApiServer } from "./api-server.js";
import { startWorker } from "./worker.js";
import { runPoll } from "../handlers/poller.js";
import { createLogger } from "../lib/logger.js";
import { config } from "../config.js";

const log = createLogger("dev");

/**
 * All-in-one local development process: provisions the table + queue, starts the
 * API and the SQS worker, and runs the poller on a fixed interval (the local
 * stand-in for the EventBridge cron).
 */
async function main(): Promise<void> {
  log.info("Starting local DeFi tracker dev stack", {
    rpcMode: config.rpcMode,
    wallets: config.watchedWallets,
  });

  await bootstrap();

  const server = startApiServer();
  const worker = startWorker();

  let round = 0;
  const tick = async () => {
    try {
      await runPoll(round++);
    } catch (err) {
      log.error("Scheduled poll failed", { error: (err as Error).message });
    }
  };

  await tick();
  const timer = setInterval(tick, config.pollIntervalMs);

  const shutdown = () => {
    log.info("Shutting down dev stack");
    clearInterval(timer);
    worker.stop();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error("Dev stack failed to start", { error: (err as Error).message });
  process.exit(1);
});
