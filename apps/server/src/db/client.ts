import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { config } from "../config";
import { logger } from "../logger";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** A transaction handle; services accept `DbOrTx` so callers can compose them in one transaction. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

// count(*) and other bigint results as numbers; values stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

let pool: pg.Pool | undefined;
let database: Db | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const { DATABASE_URL, DATABASE_POOL_SIZE } = config();
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: DATABASE_POOL_SIZE });
    // An idle client can lose its connection (database restart); the pool replaces it.
    pool.on("error", (error) => logger.warn({ err: error }, "idle database client error"));
    pool.on("connect", (client) => {
      client.on("error", (error) => logger.warn({ err: error }, "database client error"));
    });
  }
  return pool;
}

export function getDb(): Db {
  database ??= drizzle(getPool(), { schema });
  return database;
}

export async function closeDb() {
  const current = pool;
  pool = undefined;
  database = undefined;
  await current?.end();
}

export { schema };
