import { serve } from "@hono/node-server";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { closeDb } from "../db/client.js";
import { stopBoss } from "../queue/boss.js";
import { createApp } from "./app.js";

process.env.SERVICE_NAME ??= "api";

const cfg = config();
const app = createApp();

const server = serve({ fetch: app.fetch, port: cfg.PORT, hostname: "0.0.0.0" }, (info) => {
  logger.info({ port: info.port, env: cfg.NODE_ENV, baseUrl: cfg.BASE_URL }, "API запущен");
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Останавливаю API…");
  server.close();
  await stopBoss();
  await closeDb();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
