import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({});
const secretsClient = new SecretsManagerClient({});

const WATCHLIST_TABLE_NAME = process.env.WATCHLIST_TABLE_NAME!;
const EVENTS_QUEUE_URL = process.env.EVENTS_QUEUE_URL!;
const RPC_SECRET_ARN = process.env.RPC_SECRET_ARN!;
const USE_MOCK_EVENTS = process.env.USE_MOCK_EVENTS === 'true';

interface WatchlistItem {
  user_address: string;
  last_polled_block?: number;
  nft_contracts?: string[];
}

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

/**
 * IngestPoller Lambda
 * 
 * Triggered every 5 minutes by EventBridge.
 * - Reads watchlist from DynamoDB
 * - Fetches DeFi events via JSON-RPC (or generates mock events)
 * - Sends events to SQS queue
 * - Updates last_polled_block in watchlist
 */
export const handler: Handler = async (event) => {
  console.log('IngestPoller triggered', { event, useMock: USE_MOCK_EVENTS });

  try {
    // 1. Read watchlist
    const watchlistItems = await getWatchlist();
    console.log(`Found ${watchlistItems.length} addresses in watchlist`);

    if (watchlistItems.length === 0) {
      console.log('No addresses in watchlist. Add addresses to Watchlist table to start polling.');
      return { statusCode: 200, message: 'No addresses to poll' };
    }

    // 2. Fetch events for each address
    const allEvents: DeFiEvent[] = [];
    
    for (const item of watchlistItems) {
      const events = USE_MOCK_EVENTS
        ? await generateMockEvents(item)
        : await fetchRealEvents(item);
      
      allEvents.push(...events);
    }

    console.log(`Fetched ${allEvents.length} total events`);

    // 3. Send events to SQS in batches
    if (allEvents.length > 0) {
      await sendEventsToQueue(allEvents);
    }

    return {
      statusCode: 200,
      eventsProcessed: allEvents.length,
      addressesPolled: watchlistItems.length,
    };
  } catch (error) {
    console.error('Error in IngestPoller:', error);
    throw error;
  }
};

async function getWatchlist(): Promise<WatchlistItem[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: WATCHLIST_TABLE_NAME,
    })
  );
  return (result.Items || []) as WatchlistItem[];
}

async function generateMockEvents(watchlistItem: WatchlistItem): Promise<DeFiEvent[]> {
  // Generate 0-3 random mock events per address
  const eventCount = Math.floor(Math.random() * 4);
  const events: DeFiEvent[] = [];
  
  const currentBlock = watchlistItem.last_polled_block || 18000000;
  const newBlock = currentBlock + Math.floor(Math.random() * 10) + 1;

  for (let i = 0; i < eventCount; i++) {
    const eventTypes: Array<'DEPOSIT' | 'EXIT' | 'TRANSFER'> = ['DEPOSIT', 'EXIT', 'TRANSFER'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    events.push({
      event_type: eventType,
      user_address: watchlistItem.user_address,
      nft_id: `${Math.floor(Math.random() * 10000)}`,
      amount: (Math.random() * 100).toFixed(4),
      token_address: '0x' + 'a'.repeat(40),
      block_number: newBlock,
      transaction_hash: '0x' + Math.random().toString(16).substring(2, 66),
      timestamp: Date.now(),
    });
  }

  console.log(`Generated ${events.length} mock events for ${watchlistItem.user_address}`);
  return events;
}

async function fetchRealEvents(watchlistItem: WatchlistItem): Promise<DeFiEvent[]> {
  /**
   * REAL JSON-RPC IMPLEMENTATION
   * 
   * To use real events:
   * 1. Set USE_MOCK_EVENTS=false
   * 2. Store your RPC provider API key in Secrets Manager:
   *    aws secretsmanager put-secret-value \
   *      --secret-id defi-portfolio-tracker/rpc-api-key \
   *      --secret-string '{"apiKey":"your-infura-or-alchemy-key"}'
   * 
   * 3. This function should:
   *    - Get API key from Secrets Manager
   *    - Build eth_getLogs request for DeFi contract events
   *    - Filter by watchlistItem.user_address and block range
   *    - Parse logs into DeFiEvent format
   *    - Return events
   * 
   * Example eth_getLogs call:
   * POST https://mainnet.infura.io/v3/YOUR-KEY
   * {
   *   "jsonrpc": "2.0",
   *   "method": "eth_getLogs",
   *   "params": [{
   *     "address": "0xContractAddress",
   *     "fromBlock": "0x...",
   *     "toBlock": "latest",
   *     "topics": [
   *       "0xEventSignature",
   *       "0x000000000000000000000000" + watchlistItem.user_address.slice(2)
   *     ]
   *   }],
   *   "id": 1
   * }
   */

  console.log('Real RPC polling not yet implemented. Use USE_MOCK_EVENTS=true for testing.');
  
  // Get RPC API key (example)
  // const secretValue = await secretsClient.send(
  //   new GetSecretValueCommand({ SecretId: RPC_SECRET_ARN })
  // );
  // const { apiKey } = JSON.parse(secretValue.SecretString || '{}');
  
  return [];
}

async function sendEventsToQueue(events: DeFiEvent[]): Promise<void> {
  // SQS batch limit is 10 messages
  const batchSize = 10;
  
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    
    const entries = batch.map((event, index) => ({
      Id: `${i + index}`,
      MessageBody: JSON.stringify(event),
      MessageAttributes: {
        event_type: {
          DataType: 'String',
          StringValue: event.event_type,
        },
        user_address: {
          DataType: 'String',
          StringValue: event.user_address,
        },
      },
    }));

    await sqsClient.send(
      new SendMessageBatchCommand({
        QueueUrl: EVENTS_QUEUE_URL,
        Entries: entries,
      })
    );
    
    console.log(`Sent batch of ${batch.length} events to SQS`);
  }
}
