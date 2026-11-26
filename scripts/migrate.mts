import { openDb } from "./db.mts";

// On Vercel, migrations run before every build (see `vercel-build` in package.json).
// Without a database attached yet, skip instead of failing the deploy.
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set: skipping migrations. Add Neon to the Vercel project.");
  process.exit(0);
}

const { target, migrate, close } = await openDb();
console.log(`Applying migrations to ${target}…`);
await migrate();
await close();
console.log("Done.");
