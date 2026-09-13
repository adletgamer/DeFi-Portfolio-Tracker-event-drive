import express, { type Express, type Request, type Response } from "express";
import { createLogger } from "../lib/logger.js";
import { getEventsForWallet } from "../lib/store.js";
import { buildPortfolio } from "../domain/events.js";
import { config } from "../config.js";

const log = createLogger("api");

function normalizeAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Build the Express app that fronts DynamoDB (API Gateway + Lambda in AWS). */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", table: config.tableName });
  });

  app.get("/wallets", (_req: Request, res: Response) => {
    res.json({ watched: config.watchedWallets });
  });

  app.get("/wallets/:address/events", async (req: Request, res: Response) => {
    try {
      const address = normalizeAddress(req.params.address);
      const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
      const events = await getEventsForWallet(address, limit);
      res.json({ wallet: address, count: events.length, events });
    } catch (err) {
      log.error("Failed to list events", { error: (err as Error).message });
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.get("/wallets/:address/portfolio", async (req: Request, res: Response) => {
    try {
      const address = normalizeAddress(req.params.address);
      const events = await getEventsForWallet(address, 500);
      const portfolio = buildPortfolio(address, events);
      res.json(portfolio);
    } catch (err) {
      log.error("Failed to build portfolio", { error: (err as Error).message });
      res.status(500).json({ error: "internal_error" });
    }
  });

  return app;
}
