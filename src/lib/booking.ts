import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/db";
import { PAYMENT_HOLD_HOURS, holdsSpot } from "@/lib/spots";

const { sessions, bookings, organisers } = schema;

export const bookingInput = z.object({
  sessionId: z.uuid(),
  /** Set when booking through a private link (/s/[slug]). */
  privateSlug: z.string().regex(/^[\w-]{21}$/).optional(),
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(100, "That name is a bit long. Please shorten it."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Please enter a valid email address.").max(254)),
  matRequested: z.boolean(),
  paymentMethod: z.enum(["cash", "link"]).nullable(),
  consent: z.literal(true, "Please agree so we can store your booking."),
});

export type BookingInput = z.infer<typeof bookingInput>;

export type BookingFailure =
  | "not_found" // unknown, private or cancelled session
  | "started" // session already started
  | "full"
  | "mats_full"
  | "no_mats" // asked for a mat on a session without mats
  | "payment_method" // missing or not offered
  | "already_booked";

export type BookingResult =
  | { ok: true; bookingId: string; token: string; status: "confirmed" | "pending_payment" }
  | { ok: false; reason: BookingFailure };

const UNIQUE_VIOLATION = "23505";

/**
 * Books a spot. Runs in one transaction that locks the session row, so two
 * people can't both take the last spot (or the last mat).
 *
 * - Free session            → confirmed, no payment method
 * - Cash on site            → confirmed, unpaid (organiser marks paid on site)
 * - Payment link            → pending_payment, holds the spot for 24 h
 *                              (or until the session starts, if sooner)
 */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          id: sessions.id,
          kind: sessions.kind,
          startsAt: sessions.startsAt,
          spotLimit: sessions.spotLimit,
          matLimit: sessions.matLimit,
          priceCents: sessions.priceCents,
          acceptsCash: sessions.acceptsCash,
          acceptsLink: sessions.acceptsLink,
          visibility: sessions.visibility,
          privateSlug: sessions.privateSlug,
          status: sessions.status,
          organiserPaymentLink: organisers.paymentLink,
        })
        .from(sessions)
        .innerJoin(organisers, eq(organisers.id, sessions.organiserId))
        .where(eq(sessions.id, input.sessionId))
        .for("update", { of: sessions });

      if (!session || session.status !== "published") return fail("not_found");
      // Private: only via its own link. Private trainings: anyone with the link.
      // Private events (members only) open in Phase 5, with email verification.
      if (
        session.visibility === "private" &&
        (session.kind !== "training" || !input.privateSlug || input.privateSlug !== session.privateSlug)
      ) {
        return fail("not_found");
      }
      const now = new Date();
      if (session.startsAt <= now) return fail("started");

      // Payment method must match what the session offers.
      let paymentMethod: "cash" | "link" | null = null;
      if (session.priceCents > 0) {
        paymentMethod = input.paymentMethod;
        const offered =
          (paymentMethod === "cash" && session.acceptsCash) ||
          (paymentMethod === "link" && session.acceptsLink && !!session.organiserPaymentLink);
        if (!offered) return fail("payment_method");
      }

      const matRequested = input.matRequested;
      if (matRequested && (session.kind !== "training" || session.matLimit === 0)) {
        return fail("no_mats");
      }

      // Release holds that ran out, so their spots and emails are free again.
      await tx
        .update(bookings)
        .set({ status: "expired" })
        .where(
          and(
            eq(bookings.sessionId, session.id),
            eq(bookings.status, "pending_payment"),
            lte(bookings.holdExpiresAt, now),
          ),
        );

      const [counts] = await tx
        .select({
          spots: sql<number>`count(*) filter (where ${holdsSpot})`.mapWith(Number),
          mats: sql<number>`count(*) filter (where ${holdsSpot} and ${bookings.matRequested})`.mapWith(Number),
          mine: sql<number>`count(*) filter (where ${holdsSpot} and lower(${bookings.email}) = ${input.email})`.mapWith(Number),
        })
        .from(bookings)
        .where(eq(bookings.sessionId, session.id));

      if (counts.mine > 0) return fail("already_booked");
      if (counts.spots >= session.spotLimit) return fail("full");
      if (matRequested && counts.mats >= session.matLimit) return fail("mats_full");

      const status = paymentMethod === "link" ? "pending_payment" : "confirmed";
      const holdExpiresAt =
        status === "pending_payment"
          ? new Date(Math.min(now.getTime() + PAYMENT_HOLD_HOURS * 3_600_000, session.startsAt.getTime()))
          : null;
      const token = nanoid(32);

      const [inserted] = await tx.insert(bookings).values({
        sessionId: session.id,
        fullName: input.fullName,
        email: input.email,
        matRequested,
        paymentMethod,
        status,
        holdExpiresAt,
        cancelToken: token,
        consentAt: now,
      }).returning({ id: bookings.id });

      return { ok: true as const, bookingId: inserted.id, token, status };
    });
  } catch (err) {
    // Backstop: the database's own one-booking-per-email rule.
    if (isUniqueViolation(err)) return fail("already_booked");
    throw err;
  }
}

/**
 * Participant says they've paid via the payment link → booking confirmed.
 * Returns the booking id, or null if there was nothing to confirm.
 */
export async function reportPaid(token: string): Promise<string | null> {
  const updated = await db
    .update(bookings)
    .set({ status: "confirmed", paymentStatus: "reported_paid", holdExpiresAt: null })
    .where(
      and(
        eq(bookings.cancelToken, token),
        eq(bookings.paymentMethod, "link"),
        eq(bookings.paymentStatus, "unpaid"),
        // Still holding the spot: not cancelled and not expired.
        sql`(${bookings.status} = 'confirmed' or (${bookings.status} = 'pending_payment' and ${bookings.holdExpiresAt} > now()))`,
      ),
    )
    .returning({ id: bookings.id });
  return updated[0]?.id ?? null;
}

export type CancelResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: "not_found" | "not_active" | "too_late" };

/**
 * Participant cancels via their booking link. Allowed until
 * `cancel_cutoff_hours` (default 24) before the session starts.
 */
export async function cancelBooking(token: string, now = new Date()): Promise<CancelResult> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: "not_found" };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: bookings.id,
        status: bookings.status,
        holdExpiresAt: bookings.holdExpiresAt,
        startsAt: sessions.startsAt,
        cutoffHours: sessions.cancelCutoffHours,
      })
      .from(bookings)
      .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
      .where(eq(bookings.cancelToken, token))
      .for("update", { of: bookings });

    if (!row) return { ok: false as const, reason: "not_found" as const };
    const active =
      row.status === "confirmed" ||
      (row.status === "pending_payment" && !!row.holdExpiresAt && row.holdExpiresAt > now);
    if (!active) return { ok: false as const, reason: "not_active" as const };
    if (now >= cancelDeadline(row.startsAt, row.cutoffHours)) {
      return { ok: false as const, reason: "too_late" as const };
    }

    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: now, holdExpiresAt: null })
      .where(eq(bookings.id, row.id));
    return { ok: true as const, bookingId: row.id };
  });
}

/** Last moment a participant can cancel themselves. */
export function cancelDeadline(startsAt: Date, cutoffHours: number): Date {
  return new Date(startsAt.getTime() - cutoffHours * 3_600_000);
}

const TOKEN_RE = /^[\w-]{32}$/;

/** Everything the booking page needs, looked up by its secret token. */
export async function getBookingByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select({
      bookingId: bookings.id,
      createdAt: bookings.createdAt,
      fullName: bookings.fullName,
      email: bookings.email,
      matRequested: bookings.matRequested,
      paymentMethod: bookings.paymentMethod,
      status: bookings.status,
      paymentStatus: bookings.paymentStatus,
      holdExpiresAt: bookings.holdExpiresAt,
      sessionId: sessions.id,
      kind: sessions.kind,
      title: sessions.title,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      priceCents: sessions.priceCents,
      sessionStatus: sessions.status,
      description: sessions.description,
      cancelCutoffHours: sessions.cancelCutoffHours,
      organiserName: organisers.name,
      paymentLink: organisers.paymentLink,
    })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .innerJoin(organisers, eq(organisers.id, sessions.organiserId))
    .where(eq(bookings.cancelToken, token));

  if (!row) return null;
  const holdExpired =
    row.status === "pending_payment" && !!row.holdExpiresAt && row.holdExpiresAt <= new Date();
  return {
    ...row,
    status: holdExpired ? ("expired" as const) : row.status,
    cancelDeadline: cancelDeadline(row.startsAt, row.cancelCutoffHours),
    /** Still before the cancellation cutoff (as of loading). */
    beforeCancelCutoff: Date.now() < cancelDeadline(row.startsAt, row.cancelCutoffHours).getTime(),
  };
}

export type BookingView = NonNullable<Awaited<ReturnType<typeof getBookingByToken>>>;

function fail(reason: BookingFailure): BookingResult {
  return { ok: false, reason };
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
