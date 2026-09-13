import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { config } from "../config.js";

/**
 * When talking to local emulators (DynamoDB Local / ElasticMQ) the SDK still
 * needs credentials, so we supply dummy ones. In real AWS these env vars /
 * endpoints are unset and the default provider chain + regional endpoints win.
 */
const localCredentials =
  config.dynamoEndpoint || config.sqsEndpoint
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
        },
      }
    : {};

let docClient: DynamoDBDocumentClient | undefined;
export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const base = new DynamoDBClient({
      region: config.region,
      ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
      ...localCredentials,
    });
    docClient = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

let rawDynamoClient: DynamoDBClient | undefined;
export function getDynamoClient(): DynamoDBClient {
  if (!rawDynamoClient) {
    rawDynamoClient = new DynamoDBClient({
      region: config.region,
      ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
      ...localCredentials,
    });
  }
  return rawDynamoClient;
}

let sqsClient: SQSClient | undefined;
export function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: config.region,
      ...(config.sqsEndpoint ? { endpoint: config.sqsEndpoint } : {}),
      ...localCredentials,
    });
  }
  return sqsClient;
}
