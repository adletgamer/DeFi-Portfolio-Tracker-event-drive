import { SQSHandler, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const PORTFOLIO_POSITIONS_TABLE_NAME = process.env.PORTFOLIO_POSITIONS_TABLE_NAME!;

interface DeFiEvent {
  event_type: 'DEPOSIT' | 'EXIT' | 'TRANSFER';
  user_address: string;
  nft_id: string;
  amount: string;
  token_address: string;
  block_number: number;
  transaction_hash: string;
  timestamp: number;
}

interface PortfolioPosition {
  user_address: string;
  nft_id_type: string;
  nft_id: string;
  event_type: string;
  amount: string;
  token_address: string;
  block_number: number;
  transaction_hash: string;
  timestamp: number;
  updated_at: number;
}

/**
 * Processor Lambda
 * 
 * Triggered by SQS messages containing DeFi events.
 * - Processes events idempotently
 * - Writes position updates to PortfolioPositions table
 * - SK format: {nft_id}#{EVENT_TYPE} for unique event deduplication
 * - Uses partial batch failure reporting to retry only failed messages
 */
export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  console.log(`Processing ${event.Records.length} SQS messages`);

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(`Failed to process message ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  const succeeded = event.Records.length - batchItemFailures.length;
  console.log(`Processed: ${succeeded} succeeded, ${batchItemFailures.length} failed`);

  // Return failed message IDs for partial batch failure
  // SQS will retry only these messages
  return { batchItemFailures };
};

async function processRecord(record: SQSRecord): Promise<void> {
  try {
    const defiEvent: DeFiEvent = JSON.parse(record.body);
    console.log('Processing event:', defiEvent);

    await writePositionToDynamoDB(defiEvent);
  } catch (error) {
    console.error('Error processing record:', error, record);
    throw error;
  }
}

async function writePositionToDynamoDB(event: DeFiEvent): Promise<void> {
  // Sort key format: {nft_id}#{EVENT_TYPE}
  // This ensures each unique event is idempotent
  const sortKey = `${event.nft_id}#${event.event_type}`;

  const position: PortfolioPosition = {
    user_address: event.user_address,
    nft_id_type: sortKey,
    nft_id: event.nft_id,
    event_type: event.event_type,
    amount: event.amount,
    token_address: event.token_address,
    block_number: event.block_number,
    transaction_hash: event.transaction_hash,
    timestamp: event.timestamp,
    updated_at: Date.now(),
  };

  // PutItem is idempotent - same PK+SK will overwrite
  await docClient.send(
    new PutCommand({
      TableName: PORTFOLIO_POSITIONS_TABLE_NAME,
      Item: position,
    })
  );

  console.log(`Wrote position to DynamoDB: ${event.user_address} / ${sortKey}`);
}
