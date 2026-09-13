import { createApp } from "../handlers/api.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { isMain } from "./is-main.js";

const log = createLogger("api-server");

export function startApiServer(): ReturnType<
  ReturnType<typeof createApp>["listen"]
> {
  const app = createApp();
  return app.listen(config.apiPort, () => {
    log.info("API listening", {
      port: config.apiPort,
      url: `http://localhost:${config.apiPort}`,
    });
  });
}

if (isMain(import.meta.url)) {
  startApiServer();
}
