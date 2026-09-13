import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const PORTFOLIO_POSITIONS_TABLE_NAME = process.env.PORTFOLIO_POSITIONS_TABLE_NAME!;

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
 * ReadApi Lambda
 * 
 * Exposed via Lambda Function URL (no API Gateway).
 * - GET requests with ?address=0x... query parameter
 * - Returns portfolio positions for the given address
 * - Supports CORS for frontend integration
 */
export const handler: Handler = async (event) => {
  console.log('ReadApi invoked', event);

  try {
    // Parse query parameters
    const address = event.queryStringParameters?.address;

    if (!address) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          error: 'Missing required query parameter: address',
          example: '?address=0x1234567890abcdef...',
        }),
      };
    }

    // Validate Ethereum address format
    if (!isValidEthereumAddress(address)) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          error: 'Invalid Ethereum address format',
          message: 'Address must be 42 characters starting with 0x',
          provided: address,
        }),
      };
    }

    // Query DynamoDB for positions
    const positions = await getPositionsByAddress(address);

    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        address,
        positions,
        count: positions.length,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error in ReadApi:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
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

function isValidEthereumAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function getCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
