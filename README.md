# Mindspace Booking

Mobile-first booking app for the Mindspace student club: classes and events, booked without an account. See [PLAN.md](PLAN.md) for the full build plan and the PRD/brand book PDFs for requirements.

**Stack:** Next.js 16 · Tailwind CSS 4 · Postgres (Neon) via Drizzle ORM · Resend (email, coming in Phase 2) · Vercel

## Run locally

No accounts or Docker needed. Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) stored in `./.pglite`.

```bash
npm install
npm run db:reset   # create the local database and load demo data
npm run dev        # http://localhost:3000
```

PGlite allows one process at a time, so stop `npm run dev` before running `db:*` scripts.

Run the tests (booking rules, against a throwaway in-memory database) with `npm test`.

## Database

| Command | What it does |
|---|---|
| `npm run db:generate` | Create a new migration in `drizzle/` after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (local PGlite, or Neon if `DATABASE_URL` is set) |
| `npm run db:seed` | Wipe and load demo data. Refuses on a remote DB unless `SEED_ALLOW_REMOTE=1` |
| `npm run db:reset` | Delete the local database, migrate, seed |

## Deploy (Vercel + Neon)

1. Import the GitHub repo in Vercel (framework: Next.js, defaults are fine).
2. In the Vercel project: **Storage → Create Database → Neon**, connect it to all environments. This sets `DATABASE_URL`.
3. Redeploy. The `vercel-build` script applies migrations before each build.
4. Optional demo data on Neon: `SEED_ALLOW_REMOTE=1 DATABASE_URL=… npm run db:seed`.

## Brand

Colour tokens and fonts live in `src/app/globals.css` (from Brand Book p.9/17/22). Hex values were sampled from the PDF; confirm against the Canva source. Fonts: League Spartan (text), Open Sauce Sans (logo/brand headings, SIL OFL in `src/fonts`).
