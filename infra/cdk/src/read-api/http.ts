/**
 * Shared HTTP helpers for the ReadApi Lambda.
 * Kept free of AWS SDK imports so CORS/routing can be unit-tested.
 *
 * CORS is returned by the function itself. Do not also enable Function URL
 * CORS in CDK: that duplicates Access-Control-Allow-Origin and browsers
 * block the response.
 */

export const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export interface LambdaHttpEvent {
  rawPath?: string;
  path?: string;
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string; path?: string } };
}

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export type ApiRoute = 'positions' | 'watchlist' | 'not_found';

export function jsonResponse(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(payload),
  };
}

export function optionsResponse(): HttpResult {
  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS },
    body: '',
  };
}

export function getHttpMethod(event: LambdaHttpEvent): string {
  return (
    event.requestContext?.http?.method ||
    event.httpMethod ||
    'GET'
  ).toUpperCase();
}

export function getRawPath(event: LambdaHttpEvent): string {
  return event.rawPath || event.requestContext?.http?.path || event.path || '/';
}

export function resolveRoute(event: LambdaHttpEvent): ApiRoute {
  const path = getRawPath(event).split('?')[0].replace(/\/+$/, '') || '/';
  const normalized = path.toLowerCase();
  if (normalized === '/' || normalized === '/positions') {
    return 'positions';
  }
  if (normalized === '/watchlist') {
    return 'watchlist';
  }
  return 'not_found';
}

export function isValidEthereumAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}
