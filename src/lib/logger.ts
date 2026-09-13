type Level = "info" | "warn" | "error" | "debug";

function log(level: Level, scope: string, message: string, meta?: unknown): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(scope: string) {
  return {
    info: (message: string, meta?: unknown) => log("info", scope, message, meta),
    warn: (message: string, meta?: unknown) => log("warn", scope, message, meta),
    error: (message: string, meta?: unknown) => log("error", scope, message, meta),
    debug: (message: string, meta?: unknown) => log("debug", scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
