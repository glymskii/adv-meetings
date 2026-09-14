import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { closeDb, db } from "./client.js";
import { logger } from "../logger.js";

async function main() {
  logger.info("Применяю миграции…");
  await migrate(db(), { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  logger.info("Миграции применены");
  await closeDb();
}

main().catch((e) => {
  logger.error(e, "Ошибка миграции");
  process.exit(1);
});
