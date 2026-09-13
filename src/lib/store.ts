import {
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDocClient } from "./aws.js";
import { config } from "../config.js";
import {
  NormalizedEvent,
  eventId,
  eventSk,
  walletPk,
} from "../domain/events.js";

interface StoredEvent extends NormalizedEvent {
  pk: string;
  sk: string;
  id: string;
}

function toItem(e: NormalizedEvent): StoredEvent {
  return {
    pk: walletPk(e.wallet),
    sk: eventSk(e),
    id: eventId(e),
    ...e,
  };
}

/**
 * Idempotently persist a normalized event. Returns true if it was newly
 * written, false if an identical event already existed (dedupe on pk+sk).
 */
export async function putEvent(e: NormalizedEvent): Promise<boolean> {
  const item = toItem(e);
  try {
    await getDocClient().send(
      new PutCommand({
        TableName: config.tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    );
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      (err as { name?: string }).name === "ConditionalCheckFailedException"
    ) {
      return false;
    }
    throw err;
  }
}

export async function getEventsForWallet(
  wallet: string,
  limit = 100
): Promise<NormalizedEvent[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": walletPk(wallet),
        ":prefix": "EVENT#",
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (res.Items ?? []).map((item) => {
    const { pk, sk, id, ...rest } = item as StoredEvent;
    void pk;
    void sk;
    void id;
    return rest as NormalizedEvent;
  });
}
