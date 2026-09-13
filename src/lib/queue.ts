import {
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";
import { getSqsClient } from "./aws.js";
import { config } from "../config.js";
import { RawChainEvent } from "../domain/events.js";

let cachedQueueUrl: string | undefined;

/** Resolve (creating if necessary) the SQS queue URL for the configured queue. */
export async function ensureQueue(): Promise<string> {
  if (cachedQueueUrl) return cachedQueueUrl;
  const sqs = getSqsClient();
  try {
    const res = await sqs.send(
      new GetQueueUrlCommand({ QueueName: config.queueName })
    );
    cachedQueueUrl = res.QueueUrl!;
  } catch {
    const res = await sqs.send(
      new CreateQueueCommand({ QueueName: config.queueName })
    );
    cachedQueueUrl = res.QueueUrl!;
  }
  return cachedQueueUrl;
}

export async function enqueueEvents(events: RawChainEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const sqs = getSqsClient();
  const queueUrl = await ensureQueue();

  let sent = 0;
  for (let i = 0; i < events.length; i += 10) {
    const batch = events.slice(i, i + 10);
    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: batch.map((event, idx) => ({
          Id: String(i + idx),
          MessageBody: JSON.stringify(event),
        })),
      })
    );
    sent += batch.length;
  }
  return sent;
}

export interface QueuedMessage {
  receiptHandle: string;
  event: RawChainEvent;
}

export async function receiveEvents(
  maxMessages = 10,
  waitSeconds = 1
): Promise<QueuedMessage[]> {
  const sqs = getSqsClient();
  const queueUrl = await ensureQueue();
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.min(maxMessages, 10),
      WaitTimeSeconds: waitSeconds,
    })
  );
  return (res.Messages ?? []).map((m) => ({
    receiptHandle: m.ReceiptHandle!,
    event: JSON.parse(m.Body!) as RawChainEvent,
  }));
}

export async function deleteMessage(receiptHandle: string): Promise<void> {
  const sqs = getSqsClient();
  const queueUrl = await ensureQueue();
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
  );
}
