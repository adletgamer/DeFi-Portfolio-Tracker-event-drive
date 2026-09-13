import { createLogger } from "../lib/logger.js";
import { normalizeEvent, RawChainEvent } from "../domain/events.js";
import { putEvent } from "../lib/store.js";

const log = createLogger("normalizer");

export interface NormalizeResult {
  processed: number;
  written: number;
  duplicates: number;
}

/**
 * Normalize a batch of raw chain events and persist them idempotently.
 * Shared by the local worker and the AWS SQS Lambda entrypoint.
 */
export async function normalizeBatch(
  raws: RawChainEvent[]
): Promise<NormalizeResult> {
  let written = 0;
  let duplicates = 0;

  for (const raw of raws) {
    const normalized = normalizeEvent(raw);
    const isNew = await putEvent(normalized);
    if (isNew) {
      written += 1;
    } else {
      duplicates += 1;
    }
  }

  log.info("Normalized batch", {
    processed: raws.length,
    written,
    duplicates,
  });

  return { processed: raws.length, written, duplicates };
}

interface SqsRecord {
  body: string;
}
interface SqsEvent {
  Records: SqsRecord[];
}

/** AWS Lambda entrypoint (SQS trigger). */
export async function handler(event: SqsEvent): Promise<NormalizeResult> {
  const raws = event.Records.map((r) => JSON.parse(r.body) as RawChainEvent);
  return normalizeBatch(raws);
}
