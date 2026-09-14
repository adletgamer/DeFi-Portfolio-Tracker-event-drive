import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  getHttpMethod,
  isValidEthereumAddress,
  jsonResponse,
  optionsResponse,
  resolveRoute,
} from './http';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const PORTFOLIO_POSITIONS_TABLE_NAME = process.env.PORTFOLIO_POSITIONS_TABLE_NAME!;
const WATCHLIST_TABLE_NAME = process.env.WATCHLIST_TABLE_NAME!;

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

interface WatchlistItem {
  user_address: string;
  last_polled_block?: number;
  nft_contracts?: string[];
  updated_at?: number;
}

/**
 * ReadApi Lambda
 *
 * Exposed via Lambda Function URL (no API Gateway).
 * - OPTIONS preflight → 200 + CORS
 * - GET /positions?address=0x... (also GET /?address=0x... for compatibility)
 * - GET /watchlist?address=0x...
 */
export const handler: Handler = async (event) => {
  console.log('ReadApi invoked', event);

  if (getHttpMethod(event) === 'OPTIONS') {
    return optionsResponse();
  }

  if (getHttpMethod(event) !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const route = resolveRoute(event);
  if (route === 'not_found') {
    return jsonResponse(404, {
      error: 'not_found',
      message: 'Supported routes: GET /positions?address=0x... and GET /watchlist?address=0x...',
    });
  }

  const address = event.queryStringParameters?.address;

  if (!address) {
    return jsonResponse(400, {
      error: 'Missing required query parameter: address',
      example: `?address=0x1234567890abcdef...`,
    });
  }

  if (!isValidEthereumAddress(address)) {
    return jsonResponse(400, {
      error: 'Invalid Ethereum address format',
      message: 'Address must be 42 characters starting with 0x',
      provided: address,
    });
  }

  try {
    if (route === 'watchlist') {
      const item = await getWatchlistItem(address);
      return jsonResponse(200, {
        address,
        watched: Boolean(item),
        last_polled_block: item?.last_polled_block ?? null,
        updated_at: item?.updated_at ?? null,
      });
    }

    const positions = await getPositionsByAddress(address);
    return jsonResponse(200, {
      address,
      positions,
      count: positions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in ReadApi:', error);
    return jsonResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

async function getPositionsByAddress(address: string): Promise<PortfolioPosition[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: PORTFOLIO_POSITIONS_TABLE_NAME,
      KeyConditionExpression: 'user_address = :addr',
      ExpressionAttributeValues: {
        ':addr': address,
      },
    })
  );

  return (result.Items || []) as PortfolioPosition[];
}

async function getWatchlistItem(address: string): Promise<WatchlistItem | undefined> {
  if (!WATCHLIST_TABLE_NAME) {
    return undefined;
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: WATCHLIST_TABLE_NAME,
      Key: { user_address: address },
    })
  );

  return result.Item as WatchlistItem | undefined;
}
