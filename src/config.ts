import "dotenv/config";

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Resolve a service endpoint:
 *   - unset          -> local development default (localhost emulator)
 *   - explicitly ""  -> undefined (use the real AWS regional endpoint)
 *   - any other value-> that value
 */
function endpointEnv(name: string, localDefault: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return localDefault;
  if (value === "") return undefined;
  return value;
}

export interface AppConfig {
  region: string;
  dynamoEndpoint?: string;
  sqsEndpoint?: string;
  tableName: string;
  queueName: string;
  watchedWallets: string[];
  rpcMode: "mock" | "http";
  rpcUrl: string;
  apiPort: number;
  pollIntervalMs: number;
}

export function loadConfig(): AppConfig {
  const rpcMode = env("RPC_MODE", "mock").toLowerCase() === "http" ? "http" : "mock";

  return {
    region: env("AWS_REGION", "us-east-1"),
    dynamoEndpoint: endpointEnv("DYNAMODB_ENDPOINT", "http://127.0.0.1:8000"),
    sqsEndpoint: endpointEnv("SQS_ENDPOINT", "http://127.0.0.1:9324"),
    tableName: env("TABLE_NAME", "DefiEvents"),
    queueName: env("QUEUE_NAME", "defi-events"),
    watchedWallets: env(
      "WATCHED_WALLETS",
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaAAAaAaaAaaAaA"
    )
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
    rpcMode,
    rpcUrl: env("RPC_URL", "https://cloudflare-eth.com"),
    apiPort: Number(env("API_PORT", "3000")),
    pollIntervalMs: Number(env("POLL_INTERVAL_MS", "15000")),
  };
}

export const config = loadConfig();
