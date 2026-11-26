import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";

const { sessions, bookings } = schema;

/**
 * A spot is taken by a confirmed booking, or by a payment-link booking whose
 * 24 h hold hasn't run out yet. Expired holds free their spot immediately,
 * even before any cleanup job marks them "expired".
 */
export const holdsSpot = sql`(
  ${bookings.status} = 'confirmed'
  or (${bookings.status} = 'pending_payment' and ${bookings.holdExpiresAt} > now())
)`;

/** Upcoming public, published sessions with live spot counts. */
export async function listUpcomingPublicSessions() {
  await connection(); // always read fresh data at request time

  const rows = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      title: sessions.title,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      priceCents: sessions.priceCents,
      spotLimit: sessions.spotLimit,
      spotsTaken: sql<number>`count(${bookings.id}) filter (where ${holdsSpot})`.mapWith(Number),
    })
    .from(sessions)
    .leftJoin(bookings, eq(bookings.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.visibility, "public"),
        eq(sessions.status, "published"),
        gt(sessions.startsAt, sql`now()`),
      ),
    )
    .groupBy(sessions.id)
    .orderBy(asc(sessions.startsAt));

  return rows.map((r) => ({
    ...r,
    spotsLeft: Math.max(0, r.spotLimit - r.spotsTaken),
  }));
}

export type SessionSummary = Awaited<ReturnType<typeof listUpcomingPublicSessions>>[number];
