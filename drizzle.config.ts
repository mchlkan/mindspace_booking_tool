import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `npm run db:generate` only reads the schema; it needs no database connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
});
