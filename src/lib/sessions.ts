import "server-only";
import { and, asc, eq, gt, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { matsTakenSql, spotsTakenSql } from "@/lib/spots";

const { sessions, bookings, organisers } = schema;

/** Upcoming public, published sessions with live spot counts. */
export async function listUpcomingPublicSessions() {
  await connection(); // always read fresh data at request time

  const rows = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      title: sessions.title,
      bannerUrl: sessions.bannerUrl,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      priceCents: sessions.priceCents,
      spotLimit: sessions.spotLimit,
      spotsTaken: spotsTakenSql,
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

/**
 * One public session with everything the detail page and booking form need.
 * Returns null for unknown ids, private sessions and malformed ids.
 * Private sessions are only reachable through their link (getSessionBySlug).
 */
export async function getPublicSession(id: string) {
  await connection();
  if (!z.uuid().safeParse(id).success) return null;
  return getBookableSession(and(eq(sessions.id, id), eq(sessions.visibility, "public"))!);
}

/** A private session by its unguessable link slug. */
export async function getSessionBySlug(slug: string) {
  await connection();
  if (!/^[\w-]{21}$/.test(slug)) return null;
  return getBookableSession(and(eq(sessions.privateSlug, slug), eq(sessions.visibility, "private"))!);
}

async function getBookableSession(where: SQL) {
  const [row] = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      title: sessions.title,
      description: sessions.description,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      priceCents: sessions.priceCents,
      acceptsCash: sessions.acceptsCash,
      acceptsLink: sessions.acceptsLink,
      spotLimit: sessions.spotLimit,
      matLimit: sessions.matLimit,
      status: sessions.status,
      bannerUrl: sessions.bannerUrl,
      visibility: sessions.visibility,
      privateSlug: sessions.privateSlug,
      organiserName: organisers.name,
      organiserHasPaymentLink: sql<boolean>`${organisers.paymentLink} is not null`,
      spotsTaken: spotsTakenSql,
      matsTaken: matsTakenSql,
    })
    .from(sessions)
    .innerJoin(organisers, eq(organisers.id, sessions.organiserId))
    .leftJoin(bookings, eq(bookings.sessionId, sessions.id))
    .where(where)
    .groupBy(sessions.id, organisers.id);

  if (!row) return null;
  const { organiserHasPaymentLink, ...rest } = row;
  return {
    ...rest,
    // Only offer the link if the trainer actually has one set up.
    acceptsLink: row.acceptsLink && organiserHasPaymentLink,
    spotsLeft: Math.max(0, row.spotLimit - row.spotsTaken),
    matsLeft: Math.max(0, row.matLimit - row.matsTaken),
    started: row.startsAt.getTime() <= Date.now(),
  };
}

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getPublicSession>>>;
