/**
 * Standalone DB connection for scripts (migrate, seed), outside Next.js.
 * Same rule as src/db/index.ts: Neon when DATABASE_URL is set, else local PGlite.
 */
import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema.ts";

const MIGRATIONS = { migrationsFolder: "./drizzle" };

export async function openDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    const db = drizzleNeon({ client: pool, schema, casing: "snake_case" });
    return {
      db,
      target: `Neon (${new URL(url).host})`,
      migrate: () => migrateNeon(db, MIGRATIONS),
      close: () => pool.end(),
    };
  }
  const client = new PGlite(".pglite");
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  return {
    db: db as unknown as NeonDatabase<typeof schema>,
    target: "local PGlite (./.pglite)",
    migrate: () => migratePglite(db, MIGRATIONS),
    close: () => client.close(),
  };
}
