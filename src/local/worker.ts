import { normalizeBatch } from "../handlers/normalizer.js";
import { deleteMessage, receiveEvents } from "../lib/queue.js";
import { createLogger } from "../lib/logger.js";
import { config } from "../config.js";
import { waitForPort } from "./wait.js";
import { isMain } from "./is-main.js";

const log = createLogger("worker");

/**
 * Long-poll the SQS queue and run the normalizer on each batch. This mimics the
 * SQS -> Lambda trigger used in AWS. Returns a stop() function.
 */
export function startWorker(): { stop: () => void } {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const messages = await receiveEvents(10, 2);
        if (messages.length === 0) continue;
        const result = await normalizeBatch(messages.map((m) => m.event));
        for (const m of messages) {
          await deleteMessage(m.receiptHandle);
        }
        log.info("Processed messages", {
          received: messages.length,
          ...result,
        });
      } catch (err) {
        log.error("Worker loop error", { error: (err as Error).message });
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };

  void loop();
  return {
    stop: () => {
      running = false;
    },
  };
}

if (isMain(import.meta.url)) {
  (async () => {
    if (config.sqsEndpoint) {
      await waitForPort(config.sqsEndpoint, "ElasticMQ (SQS)");
    }
    log.info("Worker started");
    startWorker();
  })();
}
