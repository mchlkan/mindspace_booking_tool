import "server-only";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/app-url";
import { cancelDeadline } from "@/lib/booking";
import { bookingIcs } from "@/lib/calendar";
import { cancelScheduledEmail, sendEmail } from "@/lib/email/transport";
import { BookingConfirmedEmail } from "@/lib/email/templates/booking-confirmed";
import { SessionCancelledEmail } from "@/lib/email/templates/session-cancelled";
import { SessionChangedEmail } from "@/lib/email/templates/session-changed";
import { SessionReminderEmail } from "@/lib/email/templates/session-reminder";
import { holdsSpot } from "@/lib/spots";
import { formatDay, formatPrice, formatTime } from "@/lib/format";

const { bookings, sessions, organisers, emailLog } = schema;
const HOUR = 3_600_000;

/** Reminders go out this long before the session. */
export const REMINDER_LEAD_HOURS = 24;
/**
 * The daily job schedules reminders for sessions starting within this
 * window. Must be ≥ lead time + time between job runs (24 h), so no session
 * slips between two runs.
 */
export const REMINDER_WINDOW_HOURS = 50;

async function loadBooking(bookingId: string) {
  const [row] = await db
    .select({
      id: bookings.id,
      token: bookings.cancelToken,
      fullName: bookings.fullName,
      email: bookings.email,
      matRequested: bookings.matRequested,
      paymentMethod: bookings.paymentMethod,
      paymentStatus: bookings.paymentStatus,
      status: bookings.status,
      holdExpiresAt: bookings.holdExpiresAt,
      createdAt: bookings.createdAt,
      sessionId: sessions.id,
      kind: sessions.kind,
      title: sessions.title,
      description: sessions.description,
      location: sessions.location,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      priceCents: sessions.priceCents,
      cancelCutoffHours: sessions.cancelCutoffHours,
      sessionStatus: sessions.status,
      host: organisers.name,
      paymentLink: organisers.paymentLink,
    })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .innerJoin(organisers, eq(organisers.id, sessions.organiserId))
    .where(eq(bookings.id, bookingId));
  return row ?? null;
}
type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0];
const when = (b: LoadedBooking) => `${formatDay(b.startsAt)}, ${formatTime(b.startsAt)}–${formatTime(b.endsAt)}`;
const at = (d: Date) => `${formatDay(d)}, ${formatTime(d)}`;
const matInfo = (b: LoadedBooking) => (b.kind === "training" ? (b.matRequested ? "reserved" : "own") : null);

// ---------------------------------------------------------------------------
// Booking confirmation (+ .ics + cancel link)
// ---------------------------------------------------------------------------

export async function sendBookingConfirmation(bookingId: string) {
  const b = await loadBooking(bookingId);
  if (!b || (b.status !== "confirmed" && b.status !== "pending_payment")) return;

  const bookingUrl = appUrl(`/b/${b.token}`);
  const ics = bookingIcs({
    bookingId: b.id,
    title: `${b.title} · Mindspace`,
    description: `${b.description}\n\nYour booking: ${bookingUrl}`.trim(),
    location: b.location,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    url: bookingUrl,
  });

  const pending = b.status === "pending_payment";
  const { id } = await sendEmail({
    to: b.email,
    subject: pending ? `Almost there: pay to keep your spot at ${b.title}` : `You're booked: ${b.title}, ${at(b.startsAt)}`,
    react: BookingConfirmedEmail({
      firstName: firstName(b.fullName),
      title: b.title,
      when: when(b),
      location: b.location,
      host: b.host,
      price: formatPrice(b.priceCents),
      mat: matInfo(b),
      status: b.status as "confirmed" | "pending_payment",
      payment: b.paymentMethod,
      holdUntil: b.holdExpiresAt ? at(b.holdExpiresAt) : null,
      paymentLink: pending ? b.paymentLink : null,
      bookingUrl,
      cancelUntil: at(cancelDeadline(b.startsAt, b.cancelCutoffHours)),
    }),
    attachments: [{ filename: "mindspace-session.ics", content: ics, contentType: "text/calendar; charset=utf-8" }],
    idempotencyKey: `booking-confirmed/${b.id}`,
  });

  await db.insert(emailLog).values({
    type: "booking_confirmed",
    toEmail: b.email,
    bookingId: b.id,
    sessionId: b.sessionId,
    resendId: id,
  });

  // A cash/free booking close to the session: schedule its reminder now,
  // since the daily job may already have run.
  await scheduleReminderIfDue(b.id);
}

// ---------------------------------------------------------------------------
// 24 h session reminder
// ---------------------------------------------------------------------------

/**
 * Schedules the "see you tomorrow" email for one booking, if it should get
 * one and doesn't have one yet:
 *  - booking is confirmed and the session is published
 *  - session starts within the reminder window
 *  - the booking wasn't made inside the last 24 h before the session
 *    (they just booked; no reminder needed)
 * Goes out 24 h before the start, or right away if that moment has passed
 * (only if the session is still at least 1 h away).
 */
export async function scheduleReminderIfDue(bookingId: string, now = new Date()) {
  const b = await loadBooking(bookingId);
  if (!b || b.status !== "confirmed" || b.sessionStatus !== "published") return "skipped" as const;

  const start = b.startsAt.getTime();
  const remindAt = start - REMINDER_LEAD_HOURS * HOUR;
  if (start - now.getTime() > REMINDER_WINDOW_HOURS * HOUR) return "too_early" as const;
  if (start - now.getTime() < HOUR) return "skipped" as const;
  if (b.createdAt.getTime() >= remindAt) return "skipped" as const;

  const [existing] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(eq(emailLog.bookingId, b.id), eq(emailLog.type, "session_reminder"), isNull(emailLog.cancelledAt)),
    );
  if (existing) return "already_scheduled" as const;

  const sendAt = remindAt > now.getTime() ? new Date(remindAt) : undefined;
  const unpaidCash = b.paymentMethod === "cash" && b.paymentStatus === "unpaid" && b.priceCents > 0;

  // Claim the slot first: the unique index makes a racing second job fail here
  // instead of sending a duplicate.
  let logId: string;
  try {
    const [row] = await db
      .insert(emailLog)
      .values({
        type: "session_reminder",
        toEmail: b.email,
        bookingId: b.id,
        sessionId: b.sessionId,
        scheduledFor: sendAt ?? now,
      })
      .returning({ id: emailLog.id });
    logId = row.id;
  } catch {
    return "already_scheduled" as const;
  }

  try {
    const { id } = await sendEmail({
      to: b.email,
      subject: `Tomorrow: ${b.title} at ${formatTime(b.startsAt)}`,
      react: SessionReminderEmail({
        firstName: firstName(b.fullName),
        title: b.title,
        when: when(b),
        location: b.location,
        host: b.host,
        mat: matInfo(b),
        paymentNote: unpaidCash ? `Please bring ${formatPrice(b.priceCents)} in cash.` : null,
        bookingUrl: appUrl(`/b/${b.token}`),
      }),
      scheduledAt: sendAt,
      idempotencyKey: `session-reminder/${b.id}/${logId}`,
    });
    await db.update(emailLog).set({ resendId: id }).where(eq(emailLog.id, logId));
  } catch (err) {
    // Release the slot so the next run can retry.
    await db.delete(emailLog).where(eq(emailLog.id, logId));
    throw err;
  }
  return sendAt ? ("scheduled" as const) : ("sent_now" as const);
}

/**
 * Daily job: schedule reminders for every confirmed booking whose session
 * starts within the window. Safe to run more than once.
 */
export async function runReminderSweep(now = new Date()) {
  const due = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        eq(sessions.status, "published"),
        gt(sessions.startsAt, now),
        lte(sessions.startsAt, new Date(now.getTime() + REMINDER_WINDOW_HOURS * HOUR)),
        sql`not exists (
          select 1 from ${emailLog}
          where ${emailLog.bookingId} = ${bookings.id}
            and ${emailLog.type} = 'session_reminder'
            and ${emailLog.cancelledAt} is null
        )`,
      ),
    );

  const results: Record<string, number> = {};
  const errors: string[] = [];
  for (const { id } of due) {
    try {
      const r = await scheduleReminderIfDue(id, now);
      results[r] = (results[r] ?? 0) + 1;
    } catch (err) {
      errors.push(`${id}: ${(err as Error).message}`);
    }
  }
  return { checked: due.length, results, errors };
}

/** Cancels any not-yet-sent reminders for these bookings (e.g. on cancel). */
export async function cancelReminders(bookingIds: string[], now = new Date()) {
  if (bookingIds.length === 0) return;
  const pending = await db
    .select({ id: emailLog.id, resendId: emailLog.resendId })
    .from(emailLog)
    .where(
      and(
        inArray(emailLog.bookingId, bookingIds),
        eq(emailLog.type, "session_reminder"),
        isNull(emailLog.cancelledAt),
        gt(emailLog.scheduledFor, now),
      ),
    );
  for (const row of pending) {
    if (row.resendId) await cancelScheduledEmail(row.resendId);
    await db.update(emailLog).set({ cancelledAt: now }).where(eq(emailLog.id, row.id));
  }
}

// ---------------------------------------------------------------------------
// Session changed / cancelled by the organiser → tell everyone booked
// ---------------------------------------------------------------------------

/** Calendar SEQUENCE: grows every second, so each update supersedes the last. */
const calendarSequence = (now: Date) => Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 1000);

async function activeBookingIds(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(inArray(bookings.sessionId, sessionIds), sql`${holdsSpot}`));
  return rows.map((r) => r.id);
}

/**
 * Time or place changed: email everyone booked with the new details and an
 * updated calendar event, and move their reminders to the new time.
 */
export async function notifySessionChanged(
  sessionId: string,
  previous: { startsAt: Date; endsAt: Date; location: string },
  now = new Date(),
) {
  const ids = await activeBookingIds([sessionId]);
  if (ids.length === 0) return { notified: 0 };
  await cancelReminders(ids, now);

  const sequence = calendarSequence(now);
  let notified = 0;
  for (const id of ids) {
    const b = await loadBooking(id);
    if (!b) continue;
    const changes: { label: string; before: string; after: string }[] = [];
    const before = `${formatDay(previous.startsAt)}, ${formatTime(previous.startsAt)}–${formatTime(previous.endsAt)}`;
    if (before !== when(b)) changes.push({ label: "Time", before, after: when(b) });
    if (previous.location !== b.location) changes.push({ label: "Place", before: previous.location, after: b.location });
    if (changes.length === 0) continue;

    const bookingUrl = appUrl(`/b/${b.token}`);
    const { id: emailId } = await sendEmail({
      to: b.email,
      subject: `Changed: ${b.title} is now ${at(b.startsAt)}`,
      react: SessionChangedEmail({
        firstName: firstName(b.fullName),
        title: b.title,
        host: b.host,
        changes,
        when: when(b),
        location: b.location,
        bookingUrl,
        canCancel: now < cancelDeadline(b.startsAt, b.cancelCutoffHours),
      }),
      attachments: [
        {
          filename: "mindspace-session.ics",
          content: bookingIcs({
            bookingId: b.id,
            title: `${b.title} · Mindspace`,
            description: `${b.description}\n\nYour booking: ${bookingUrl}`.trim(),
            location: b.location,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            url: bookingUrl,
            sequence,
          }),
          contentType: "text/calendar; charset=utf-8",
        },
      ],
    });
    await db.insert(emailLog).values({
      type: "session_changed",
      toEmail: b.email,
      bookingId: b.id,
      sessionId: b.sessionId,
      resendId: emailId,
    });
    notified++;
    await scheduleReminderIfDue(b.id, now);
  }
  return { notified };
}

/** Sessions cancelled: email everyone booked and cancel their reminders. */
export async function notifySessionsCancelled(sessionIds: string[], now = new Date()) {
  const ids = await activeBookingIds(sessionIds);
  await cancelReminders(ids, now);

  const sequence = calendarSequence(now);
  for (const id of ids) {
    const b = await loadBooking(id);
    if (!b) continue;
    const bookingUrl = appUrl(`/b/${b.token}`);
    const { id: emailId } = await sendEmail({
      to: b.email,
      subject: `Cancelled: ${b.title}, ${at(b.startsAt)}`,
      react: SessionCancelledEmail({
        firstName: firstName(b.fullName),
        title: b.title,
        host: b.host,
        when: when(b),
        location: b.location,
        paid: b.paymentStatus !== "unpaid",
        browseUrl: appUrl("/"),
      }),
      attachments: [
        {
          filename: "mindspace-session.ics",
          content: bookingIcs({
            bookingId: b.id,
            title: `${b.title} · Mindspace`,
            description: "This session was cancelled.",
            location: b.location,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            url: bookingUrl,
            cancelled: true,
            sequence,
          }),
          contentType: "text/calendar; charset=utf-8",
        },
      ],
    });
    await db.insert(emailLog).values({
      type: "session_cancelled",
      toEmail: b.email,
      bookingId: b.id,
      sessionId: b.sessionId,
      resendId: emailId,
    });
  }
  return { notified: ids.length };
}
