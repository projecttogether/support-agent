import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { TEST_DATABASE_URL } from "./env";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Creates a fresh test database and applies the migrations. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(database)) throw new Error(`Unsafe test database name: ${database}`);
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
  });
  await admin.connect();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.query(`create database ${database}`);
  await admin.end();
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  await migrate(drizzle(pool), { migrationsFolder: path.join(here, "../../drizzle") });
  await pool.end();
}
