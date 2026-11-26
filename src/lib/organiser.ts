import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import type { Organiser } from "@/lib/auth";
import { canManage } from "@/lib/auth";
import { MAX_SERIES_WEEKS, occurrences, type SessionFields } from "@/lib/session-input";
import { holdsSpot, matsTakenSql, spotsTakenSql } from "@/lib/spots";
import { addDays } from "@/lib/time";

const { sessions, series, bookings, organisers } = schema;
const HOUR = 3_600_000;

type Fail = { ok: false; field?: string; message: string };
const fail = (message: string, field?: string): Fail => ({ ok: false, field, message });

/** What kind of session each role may create. */
export function allowedKinds(me: Organiser): ("training" | "event")[] {
  if (me.role === "admin") return ["training", "event"];
  return me.role === "trainer" ? ["training"] : ["event"];
}

function checkCommon(me: Organiser, f: SessionFields, ownerPaymentLink: string | null): Fail | null {
  if (!allowedKinds(me).includes(f.kind)) return fail("You can't create this kind of session.", "kind");
  if (f.acceptsLink && !ownerPaymentLink) {
    return fail("Add your payment link in your profile first.", "acceptsLink");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Create (one-off or weekly)
// ---------------------------------------------------------------------------

export async function createSessions(
  me: Organiser,
  f: SessionFields,
  repeat: { repeatWeekly: boolean; repeatUntil: string },
  bannerUrl: string | null,
  now = new Date(),
): Promise<{ ok: true; ids: string[] } | Fail> {
  const problem = checkCommon(me, f, me.paymentLink);
  if (problem) return problem;

  let until: string | undefined;
  if (repeat.repeatWeekly) {
    until = repeat.repeatUntil;
    if (until <= f.date) return fail("The last date must be after the first one.", "repeatUntil");
    if (until > addDays(f.date, 7 * (MAX_SERIES_WEEKS - 1))) {
      return fail(`A series can run for up to ${MAX_SERIES_WEEKS} weeks.`, "repeatUntil");
    }
  }

  const times = occurrences(f, until);
  if (times[0].startsAt <= now) return fail("This date and time is in the past.", "date");

  const ids = await db.transaction(async (tx) => {
    let seriesId: string | null = null;
    if (until) {
      const [s] = await tx
        .insert(series)
        .values({
          organiserId: me.id,
          weekday: new Date(`${f.date}T12:00:00Z`).getUTCDay(),
          startTime: f.startTime,
          durationMinutes: Math.round((times[0].endsAt.getTime() - times[0].startsAt.getTime()) / 60_000),
          startsOn: f.date,
          endsOn: until,
        })
        .returning({ id: series.id });
      seriesId = s.id;
    }
    const rows = await tx
      .insert(sessions)
      .values(
        times.map((t) => ({
          kind: f.kind,
          organiserId: me.id,
          seriesId,
          title: f.title,
          description: f.description,
          location: f.location,
          startsAt: t.startsAt,
          endsAt: t.endsAt,
          spotLimit: f.spotLimit,
          matLimit: f.kind === "training" ? f.matLimit : 0,
          priceCents: f.priceCents,
          acceptsCash: f.priceCents === 0 ? false : f.acceptsCash,
          acceptsLink: f.priceCents === 0 ? false : f.acceptsLink,
          visibility: f.visibility,
          // Each occurrence gets its own unguessable link.
          privateSlug: f.visibility === "private" ? nanoid() : null,
          bannerUrl,
          cancelCutoffHours: f.cancelCutoffHours,
        })),
      )
      .returning({ id: sessions.id });
    return rows.map((r) => r.id);
  });
  return { ok: true, ids };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Sessions on the dashboard: from two weeks ago onwards. Admins see all. */
export async function listDashboardSessions(me: Organiser, now = new Date()) {
  const unpaidSql = sql<number>`count(${bookings.id}) filter (where ${holdsSpot} and ${sessions.priceCents} > 0 and ${bookings.paymentStatus} <> 'paid')`.mapWith(Number);
  const rows = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      title: sessions.title,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      status: sessions.status,
      visibility: sessions.visibility,
      spotLimit: sessions.spotLimit,
      matLimit: sessions.matLimit,
      priceCents: sessions.priceCents,
      seriesId: sessions.seriesId,
      organiserName: organisers.name,
      spotsTaken: spotsTakenSql,
      matsTaken: matsTakenSql,
      unpaid: unpaidSql,
    })
    .from(sessions)
    .innerJoin(organisers, eq(organisers.id, sessions.organiserId))
    .leftJoin(bookings, eq(bookings.sessionId, sessions.id))
    .where(
      and(
        gte(sessions.startsAt, new Date(now.getTime() - 14 * 24 * HOUR)),
        me.role === "admin" ? undefined : eq(sessions.organiserId, me.id),
      ),
    )
    .groupBy(sessions.id, organisers.id)
    .orderBy(asc(sessions.startsAt));
  return rows.map((r) => ({ ...r, ended: r.endsAt <= now }));
}

/** One session with its bookings, if this organiser may manage it. */
export async function getManagedSession(me: Organiser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [s] = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      organiserId: sessions.organiserId,
      organiserName: organisers.name,
      organiserPaymentLink: organisers.paymentLink,
      seriesId: sessions.seriesId,
      title: sessions.title,
      description: sessions.description,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      spotLimit: sessions.spotLimit,
      matLimit: sessions.matLimit,
      priceCents: sessions.priceCents,
      acceptsCash: sessions.acceptsCash,
      acceptsLink: sessions.acceptsLink,
      visibility: sessions.visibility,
      privateSlug: sessions.privateSlug,
      bannerUrl: sessions.bannerUrl,
      status: sessions.status,
      cancelCutoffHours: sessions.cancelCutoffHours,
    })
    .from(sessions)
    .innerJoin(organisers, eq(organisers.id, sessions.organiserId))
    .where(eq(sessions.id, id));
  if (!s || !canManage(me, s)) return null;

  const list = await db
    .select({
      id: bookings.id,
      fullName: bookings.fullName,
      email: bookings.email,
      matRequested: bookings.matRequested,
      paymentMethod: bookings.paymentMethod,
      paymentStatus: bookings.paymentStatus,
      status: bookings.status,
      holdExpiresAt: bookings.holdExpiresAt,
      createdAt: bookings.createdAt,
      holding: sql<boolean>`${holdsSpot}`,
    })
    .from(bookings)
    .where(eq(bookings.sessionId, id))
    .orderBy(desc(sql`${holdsSpot}`), asc(bookings.createdAt));

  const active = list.filter((b) => b.holding);
  const now = Date.now();
  return {
    ...s,
    /** Not started yet (as of loading). */
    upcoming: s.startsAt.getTime() > now,
    bookings: list,
    spotsTaken: active.length,
    matsTaken: active.filter((b) => b.matRequested).length,
    unpaid: s.priceCents > 0 ? active.filter((b) => b.paymentStatus !== "paid").length : 0,
  };
}

export type ManagedSession = NonNullable<Awaited<ReturnType<typeof getManagedSession>>>;

// ---------------------------------------------------------------------------
// Edit (one occurrence)
// ---------------------------------------------------------------------------

export async function updateSession(
  me: Organiser,
  id: string,
  f: SessionFields,
  bannerUrl: string | null | undefined, // undefined = keep
  now = new Date(),
): Promise<
  | { ok: true; previous: { startsAt: Date; endsAt: Date; location: string }; timeChanged: boolean; locationChanged: boolean }
  | Fail
> {
  const current = await getManagedSession(me, id);
  if (!current) return fail("Session not found.");
  if (current.status !== "published") return fail("Cancelled sessions can't be edited.");
  if (current.startsAt <= now) return fail("This session has already started.");
  if (f.kind !== current.kind) return fail("The session type can't be changed.", "kind");
  // The payment link checked is the session owner's (an admin may edit others' sessions).
  const problem = checkCommon(me, f, current.organiserPaymentLink);
  if (problem) return problem;

  const [t] = occurrences(f);
  if (t.startsAt <= now) return fail("This date and time is in the past.", "date");
  if (f.spotLimit < current.spotsTaken) {
    return fail(`${current.spotsTaken} people are already booked. Spots can't go below that.`, "spotLimit");
  }
  if (f.kind === "training" && f.matLimit < current.matsTaken) {
    return fail(`${current.matsTaken} mats are already reserved. Mats can't go below that.`, "matLimit");
  }

  const timeChanged =
    t.startsAt.getTime() !== current.startsAt.getTime() || t.endsAt.getTime() !== current.endsAt.getTime();
  const locationChanged = f.location !== current.location;

  await db
    .update(sessions)
    .set({
      title: f.title,
      description: f.description,
      location: f.location,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      spotLimit: f.spotLimit,
      matLimit: f.kind === "training" ? f.matLimit : 0,
      priceCents: f.priceCents,
      acceptsCash: f.priceCents === 0 ? false : f.acceptsCash,
      acceptsLink: f.priceCents === 0 ? false : f.acceptsLink,
      visibility: f.visibility,
      privateSlug: f.visibility === "private" ? (current.privateSlug ?? nanoid()) : current.privateSlug,
      cancelCutoffHours: f.cancelCutoffHours,
      ...(bannerUrl !== undefined ? { bannerUrl } : {}),
      updatedAt: now,
    })
    .where(eq(sessions.id, id));

  return {
    ok: true,
    previous: { startsAt: current.startsAt, endsAt: current.endsAt, location: current.location },
    timeChanged,
    locationChanged,
  };
}

// ---------------------------------------------------------------------------
// Cancel (one, or this and all later ones in the series)
// ---------------------------------------------------------------------------

export async function cancelSessions(
  me: Organiser,
  id: string,
  scope: "one" | "following",
  now = new Date(),
): Promise<{ ok: true; ids: string[] } | Fail> {
  const current = await getManagedSession(me, id);
  if (!current) return fail("Session not found.");
  if (current.status !== "published") return fail("This session is already cancelled.");
  if (current.endsAt <= now) return fail("This session is already over.");

  let ids = [id];
  if (scope === "following" && current.seriesId) {
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.seriesId, current.seriesId),
          eq(sessions.status, "published"),
          gte(sessions.startsAt, current.startsAt),
        ),
      );
    ids = rows.map((r) => r.id);
  }
  await db.update(sessions).set({ status: "cancelled", updatedAt: now }).where(inArray(sessions.id, ids));
  return { ok: true, ids };
}

// ---------------------------------------------------------------------------
// Payment tracking
// ---------------------------------------------------------------------------

/**
 * Organiser marks a booking paid or unpaid. Marking a pending payment-link
 * booking as paid also confirms it (no more 24 h hold).
 */
export async function setPaymentStatus(
  me: Organiser,
  bookingId: string,
  to: "paid" | "unpaid",
): Promise<{ ok: true; becameConfirmed: boolean } | Fail> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return fail("Booking not found.");
  const [b] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      holding: sql<boolean>`${holdsSpot}`,
      organiserId: sessions.organiserId,
      priceCents: sessions.priceCents,
    })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(eq(bookings.id, bookingId));
  if (!b || !canManage(me, b)) return fail("Booking not found.");
  if (!b.holding) return fail("This booking is no longer active.");
  if (b.priceCents === 0) return fail("This session is free.");

  const becameConfirmed = to === "paid" && b.status === "pending_payment";
  await db
    .update(bookings)
    .set({
      paymentStatus: to,
      ...(becameConfirmed ? { status: "confirmed" as const, holdExpiresAt: null } : {}),
    })
    .where(eq(bookings.id, bookingId));
  return { ok: true, becameConfirmed };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfile(
  me: Organiser,
  p: { name: string; paymentLink: string | null; photoUrl?: string | null },
) {
  await db
    .update(organisers)
    .set({ name: p.name, paymentLink: p.paymentLink, ...(p.photoUrl !== undefined ? { photoUrl: p.photoUrl } : {}) })
    .where(eq(organisers.id, me.id));
}
