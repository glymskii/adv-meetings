import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema/index.js";

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof createDb> | null = null;

function createDb(p: pg.Pool) {
  return drizzle(p, { schema, casing: "snake_case" });
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config().DATABASE_URL, max: 10 });
  }
  return pool;
}

export function db() {
  if (!dbInstance) dbInstance = createDb(getPool());
  return dbInstance;
}

export type Db = ReturnType<typeof db>;

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

export { schema };
