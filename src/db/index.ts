import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;

/**
 * DATABASE_URL set   → Neon Postgres (production, previews, or local against Neon).
 * DATABASE_URL unset → PGlite, an embedded Postgres stored in ./.pglite, so the
 *                      app runs locally with no accounts or Docker.
 * Both speak the same Postgres dialect, so queries behave identically.
 */
function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzleNeon({ client: new Pool({ connectionString: url }), schema, casing: "snake_case" });
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Add Neon to the Vercel project.");
  }
  // The query-builder API is identical; the cast only unifies the driver types.
  return drizzlePglite({ client: new PGlite(".pglite"), schema, casing: "snake_case" }) as unknown as Db;
}

// Connect lazily on first use (so builds never need a database), and reuse
// one instance across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Db };
function getDb(): Db {
  return (globalForDb.db ??= createDb());
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
