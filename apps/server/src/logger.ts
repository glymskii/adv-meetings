import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const pretty = process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "false";

export const logger = pino({
  level,
  base: { service: process.env.SERVICE_NAME ?? "server" },
  // Транскрипты и отчёты в логи не пишем — только идентификаторы и метрики.
  redact: { paths: ["*.text", "*.transcript", "*.fullText", "req.headers.authorization"], censor: "[redacted]" },
  ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } } : {}),
});

export type Logger = typeof logger;
