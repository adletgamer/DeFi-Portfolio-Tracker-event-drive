import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import { getDynamoClient } from "../lib/aws.js";
import { ensureQueue } from "../lib/queue.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { sleep, waitForPort } from "./wait.js";
import { isMain } from "./is-main.js";

const log = createLogger("bootstrap");

async function ensureTable(): Promise<void> {
  const client = getDynamoClient();
  try {
    await client.send(new DescribeTableCommand({ TableName: config.tableName }));
    log.info("DynamoDB table already exists", { table: config.tableName });
    return;
  } catch {
    // Table does not exist yet; create it below.
  }

  try {
    await client.send(
      new CreateTableCommand({
        TableName: config.tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
      })
    );
    log.info("Created DynamoDB table", { table: config.tableName });
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) {
      throw err;
    }
  }

  for (let i = 0; i < 30; i++) {
    const res = await client.send(
      new DescribeTableCommand({ TableName: config.tableName })
    );
    if (res.Table?.TableStatus === "ACTIVE") {
      log.info("DynamoDB table is ACTIVE", { table: config.tableName });
      return;
    }
    await sleep(500);
  }
  throw new Error(`Table ${config.tableName} did not become ACTIVE`);
}

/** Idempotently provision the local DynamoDB table and SQS queue. */
export async function bootstrap(): Promise<void> {
  if (config.dynamoEndpoint) {
    await waitForPort(config.dynamoEndpoint, "DynamoDB Local");
  }
  if (config.sqsEndpoint) {
    await waitForPort(config.sqsEndpoint, "ElasticMQ (SQS)");
  }

  await ensureTable();
  const queueUrl = await ensureQueue();
  log.info("SQS queue ready", { queueUrl });
}

if (isMain(import.meta.url)) {
  bootstrap()
    .then(() => log.info("Bootstrap complete"))
    .catch((err) => {
      log.error("Bootstrap failed", { error: (err as Error).message });
      process.exit(1);
    });
}
