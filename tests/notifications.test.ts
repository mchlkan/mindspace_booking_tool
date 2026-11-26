/**
 * Emails, calendar invites, cancellation and reminder scheduling.
 * Emails go to a temporary local outbox folder; nothing is sent.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, schema } from "@/db";
import { cancelBooking, createBooking, getBookingByToken, type BookingInput } from "@/lib/booking";
import { bookingIcs } from "@/lib/calendar";
import { listOutbox } from "@/lib/email/transport";
import {
  cancelReminders,
  runReminderSweep,
  scheduleReminderIfDue,
  sendBookingConfirmation,
} from "@/lib/notifications";

const { organisers, sessions, bookings, emailLog } = schema;
const HOUR = 3_600_000;
let trainerId: string;
let outbox: string;

before(async () => {
  assert.equal(process.env.DATABASE_URL, undefined, "Tests must not run against a real database");
  assert.equal(process.env.RESEND_API_KEY, undefined, "Tests must not send real email");
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "mindspace-outbox-"));
  process.env.EMAIL_OUTBOX_DIR = outbox;
  await db.execute(sql`truncate email_log, bookings, sessions, organisers cascade`);
  const [t] = await db
    .insert(organisers)
    .values({ email: "t@example.com", name: "Ana Costa", role: "trainer", status: "approved", paymentLink: "https://pay.example/ana" })
    .returning();
  trainerId = t.id;
});

after(async () => {
  if (outbox) await rm(outbox, { recursive: true, force: true });
});

async function makeSession(startsInHours: number, overrides: Partial<typeof sessions.$inferInsert> = {}) {
  const startsAt = new Date(Date.now() + startsInHours * HOUR);
  const [s] = await db
    .insert(sessions)
    .values({
      kind: "training",
      organiserId: trainerId,
      title: "Sunrise Yoga",
      description: "Gentle flow.",
      location: "Rooftop",
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      spotLimit: 1,
      matLimit: 1,
      priceCents: 500,
      acceptsCash: true,
      acceptsLink: true,
      ...overrides,
    })
    .returning();
  return s;
}

function input(sessionId: string, overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    sessionId,
    fullName: "Sofia Pereira",
    email: `s${Math.random().toString(36).slice(2)}@example.com`,
    matRequested: true,
    paymentMethod: "cash",
    consent: true,
    ...overrides,
  };
}

async function book(sessionId: string, overrides: Partial<BookingInput> = {}) {
  const r = await createBooking(input(sessionId, overrides));
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}

/** Pretend the booking was made `hoursAgo` hours ago. */
async function backdate(bookingId: string, hoursAgo: number) {
  await db
    .update(bookings)
    .set({ createdAt: new Date(Date.now() - hoursAgo * HOUR) })
    .where(eq(bookings.id, bookingId));
}

async function liveReminders(bookingId: string) {
  return db
    .select()
    .from(emailLog)
    .where(and(eq(emailLog.bookingId, bookingId), eq(emailLog.type, "session_reminder"), isNull(emailLog.cancelledAt)));
}

describe("booking confirmation email", () => {
  test("cash booking: confirmation with calendar invite, booking link and club reply-to", async () => {
    const s = await makeSession(72);
    const r = await book(s.id);
    await sendBookingConfirmation(r.bookingId);

    const [email] = await listOutbox();
    assert.match(email.subject, /^You're booked: Sunrise Yoga/);
    assert.equal(email.replyTo, "mindspace.club@novasbe.pt");
    assert.match(email.html, new RegExp(`/b/${r.token}`));
    assert.match(email.text, /Hi Sofia/);
    assert.match(email.text, /Reserved for you/);
    assert.match(email.text, /cancel your booking/i);

    assert.equal(email.attachments.length, 1);
    const ics = email.attachments[0].content;
    assert.match(ics, /METHOD:PUBLISH/);
    assert.match(ics, new RegExp(`UID:booking-${r.bookingId}@mindspace`));
    const dt = s.startsAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    assert.match(ics, new RegExp(`DTSTART:${dt}`));

    const log = await db.select().from(emailLog).where(eq(emailLog.bookingId, r.bookingId));
    assert.deepEqual(log.map((l) => l.type), ["booking_confirmed"]);
  });

  test("payment-link booking: 'almost there' email with the trainer's payment link", async () => {
    const s = await makeSession(72);
    const r = await book(s.id, { paymentMethod: "link" });
    await sendBookingConfirmation(r.bookingId);
    const [email] = await listOutbox();
    assert.match(email.subject, /^Almost there/);
    assert.match(email.html, /https:\/\/pay\.example\/ana/);
  });

  test("a booking made 30 h ahead also gets its reminder scheduled right away", async () => {
    const s = await makeSession(30);
    const r = await book(s.id);
    await sendBookingConfirmation(r.bookingId);
    const emails = await listOutbox();
    assert.equal(emails.length, 2);
    const reminder = emails.find((e) => e.subject.startsWith("Tomorrow"));
    assert.equal(reminder?.scheduledAt, new Date(s.startsAt.getTime() - 24 * HOUR).toISOString());
  });
});

describe("reminder scheduling", () => {
  test("scheduled exactly 24 h before, only once", async () => {
    const s = await makeSession(40);
    const r = await book(s.id);
    await backdate(r.bookingId, 72);

    assert.equal(await scheduleReminderIfDue(r.bookingId), "scheduled");
    assert.equal(await scheduleReminderIfDue(r.bookingId), "already_scheduled");

    const rows = await liveReminders(r.bookingId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scheduledFor?.getTime(), s.startsAt.getTime() - 24 * HOUR);
    const [email] = await listOutbox();
    assert.match(email.subject, /^Tomorrow: Sunrise Yoga/);
    assert.match(email.text, /Please bring €5 in cash/);
  });

  test("sent right away if the 24 h mark has passed (booked long ago)", async () => {
    const s = await makeSession(10);
    const r = await book(s.id);
    await backdate(r.bookingId, 96);
    assert.equal(await scheduleReminderIfDue(r.bookingId), "sent_now");
  });

  test("no reminder for people who booked within the last 24 h before the session", async () => {
    const s = await makeSession(10);
    const r = await book(s.id);
    assert.equal(await scheduleReminderIfDue(r.bookingId), "skipped");
  });

  test("no reminder yet for sessions more than ~2 days away", async () => {
    const s = await makeSession(72);
    const r = await book(s.id);
    assert.equal(await scheduleReminderIfDue(r.bookingId), "too_early");
  });

  test("unpaid payment-link bookings don't get reminders", async () => {
    const s = await makeSession(30);
    const r = await book(s.id, { paymentMethod: "link" });
    await backdate(r.bookingId, 48);
    assert.equal(await scheduleReminderIfDue(r.bookingId), "skipped");
  });

  test("daily job: every booking gets exactly one reminder, 24 h before, whatever the start time", async () => {
    const start = Date.now();
    const offsets = [25.5, 30, 47.9, 48.1, 49.5, 61, 73, 95.25, 119];
    const made = [];
    for (const h of offsets) {
      const s = await makeSession(h, { spotLimit: 5 });
      const r = await book(s.id);
      made.push({ s, r });
    }
    // Simulate the cron running once a day for 6 days.
    for (let day = 0; day < 6; day++) {
      const res = await runReminderSweep(new Date(start + day * 24 * HOUR));
      assert.deepEqual(res.errors, []);
    }
    for (const { s, r } of made) {
      const rows = await liveReminders(r.bookingId);
      assert.equal(rows.length, 1, `session at +${(s.startsAt.getTime() - start) / HOUR} h`);
      assert.equal(rows[0].scheduledFor?.getTime(), s.startsAt.getTime() - 24 * HOUR);
    }
  });
});

describe("cancelling", () => {
  test("cancel before the cutoff frees the spot and cancels the scheduled reminder", async () => {
    const s = await makeSession(40);
    const r = await book(s.id);
    await backdate(r.bookingId, 72);
    await scheduleReminderIfDue(r.bookingId);

    // Session is full (1 spot).
    assert.deepEqual(await createBooking(input(s.id)), { ok: false, reason: "full" });

    const result = await cancelBooking(r.token);
    assert.deepEqual(result, { ok: true, bookingId: r.bookingId });
    await cancelReminders([r.bookingId]);

    assert.equal((await getBookingByToken(r.token))?.status, "cancelled");
    assert.equal((await liveReminders(r.bookingId)).length, 0);
    const reminder = (await listOutbox()).find((e) => e.subject.startsWith("Tomorrow"));
    assert.ok(reminder?.cancelledAt, "reminder in outbox should be marked cancelled");

    // Spot is free again.
    assert.ok((await createBooking(input(s.id))).ok);
  });

  test("can't cancel within 24 h of the session, or twice", async () => {
    const soon = await makeSession(20);
    const r1 = await book(soon.id);
    assert.deepEqual(await cancelBooking(r1.token), { ok: false, reason: "too_late" });

    const later = await makeSession(72);
    const r2 = await book(later.id);
    assert.ok((await cancelBooking(r2.token)).ok);
    assert.deepEqual(await cancelBooking(r2.token), { ok: false, reason: "not_active" });
    assert.deepEqual(await cancelBooking("x".repeat(32)), { ok: false, reason: "not_found" });
  });

  test("the cutoff follows the session's own setting", async () => {
    const s = await makeSession(20, { cancelCutoffHours: 12 });
    const r = await book(s.id);
    assert.ok((await cancelBooking(r.token)).ok);
  });
});

describe("calendar file", () => {
  test("cancelled bookings produce a CANCELLED event with the same UID", () => {
    const base = {
      bookingId: "abc",
      title: "Yoga",
      description: "",
      location: "Rooftop",
      startsAt: new Date("2026-12-05T07:30:00Z"),
      endsAt: new Date("2026-12-05T08:30:00Z"),
      url: "http://localhost:3000/b/x",
    };
    const ics = bookingIcs({ ...base, cancelled: true });
    assert.match(ics, /UID:booking-abc@mindspace/);
    assert.match(ics, /STATUS:CANCELLED/);
    assert.match(ics, /DTSTART:20261205T073000Z/);
    assert.match(ics, /DTEND:20261205T083000Z/);
  });
});
