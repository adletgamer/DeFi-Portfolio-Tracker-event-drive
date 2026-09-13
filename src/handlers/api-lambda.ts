import { getEventsForWallet } from "../lib/store.js";
import { buildPortfolio } from "../domain/events.js";
import { config } from "../config.js";

/**
 * AWS Lambda entrypoint for the HTTP API (API Gateway HTTP API / payload v2).
 * Mirrors the routes served locally by the Express app in `api.ts`, but without
 * the Express dependency so the Lambda bundle stays small.
 */
interface HttpApiEvent {
  rawPath: string;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string; path?: string } };
}

interface HttpApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function json(statusCode: number, payload: unknown): HttpApiResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function handler(event: HttpApiEvent): Promise<HttpApiResult> {
  const path = event.rawPath || event.requestContext?.http?.path || "";
  const address = event.pathParameters?.address?.toLowerCase();

  if (path === "/health") {
    return json(200, { status: "ok", table: config.tableName });
  }
  if (path === "/wallets") {
    return json(200, { watched: config.watchedWallets });
  }

  if (address && path.endsWith("/events")) {
    const limit = Math.min(
      Number(event.queryStringParameters?.limit ?? 100) || 100,
      500
    );
    const events = await getEventsForWallet(address, limit);
    return json(200, { wallet: address, count: events.length, events });
  }

  if (address && path.endsWith("/portfolio")) {
    const events = await getEventsForWallet(address, 500);
    return json(200, buildPortfolio(address, events));
  }

  return json(404, { error: "not_found" });
}
