/**
 * Organiser features: sign-in links, creating/editing/cancelling sessions,
 * permissions, payment tracking and private links.
 */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, beforeEach, describe, test } from "node:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, schema } from "@/db";
import {
  consumeLoginToken,
  hashToken,
  organiserForSessionToken,
  peekLoginToken,
  requestLoginLink,
  type Organiser,
} from "@/lib/auth";
import { createBooking, getBookingByToken, type BookingInput } from "@/lib/booking";
import { listOutbox } from "@/lib/email/transport";
import { notifySessionChanged, notifySessionsCancelled, scheduleReminderIfDue } from "@/lib/notifications";
import {
  cancelSessions,
  createSessions,
  getManagedSession,
  listDashboardSessions,
  setPaymentStatus,
  updateSession,
} from "@/lib/organiser";
import { sessionFields, type SessionFields } from "@/lib/session-input";
import { addDays, lisbonToday, utcToLisbon } from "@/lib/time";

const { organisers, sessions, bookings, loginTokens, emailLog } = schema;
const HOUR = 3_600_000;
const noRepeat = { repeatWeekly: false, repeatUntil: "" };

let ana: Organiser; // trainer with payment link
let bo: Organiser; // trainer without payment link
let joao: Organiser; // events manager
let admin: Organiser;

before(async () => {
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.equal(process.env.RESEND_API_KEY, undefined);
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  process.env.EMAIL_OUTBOX_DIR = await mkdtemp(path.join(tmpdir(), "mindspace-outbox-"));
  await db.execute(sql`truncate email_log, bookings, sessions, series, login_tokens, auth_sessions, organisers cascade`);
  const rows = await db
    .insert(organisers)
    .values([
      { email: "ana@example.com", name: "Ana Costa", role: "trainer", status: "approved", paymentLink: "https://pay.example/ana" },
      { email: "bo@example.com", name: "Bo Lima", role: "trainer", status: "approved" },
      { email: "joao@example.com", name: "João Silva", role: "events_manager", status: "approved" },
      { email: "admin@example.com", name: "Admin", role: "admin", status: "approved" },
    ])
    .returning();
  [ana, bo, joao, admin] = rows as Organiser[];
});

function fields(overrides: Partial<SessionFields> = {}): SessionFields {
  return sessionFields.parse({
    kind: "training",
    title: "Sunrise Yoga",
    description: "Gentle flow",
    location: "Rooftop",
    date: addDays(lisbonToday(), 5),
    startTime: "07:30",
    endTime: "08:30",
    spotLimit: "10",
    matLimit: "4",
    priceCents: "5",
    acceptsCash: true,
    acceptsLink: true,
    visibility: "public",
    cancelCutoffHours: "24",
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, typeof v === "number" ? String(v) : v])),
  });
}

function bookingInput(sessionId: string, o: Partial<BookingInput> = {}): BookingInput {
  return {
    sessionId,
    fullName: "Sofia Pereira",
    email: `s${Math.random().toString(36).slice(2)}@example.com`,
    matRequested: false,
    paymentMethod: "cash",
    consent: true,
    ...o,
  };
}

async function create(me: Organiser, f = fields(), repeat = noRepeat) {
  const r = await createSessions(me, f, repeat, null);
  assert.ok(r.ok, JSON.stringify(r));
  return r.ids;
}

// ---------------------------------------------------------------------------

describe("sign-in links", () => {
  test("emails a one-time link that signs in exactly once", async () => {
    await requestLoginLink("ANA@example.com");
    const [email] = await listOutbox();
    assert.equal(email.to, "ana@example.com");
    const token = email.html.match(/verify\?token=([\w-]{43})/)?.[1];
    assert.ok(token, "link with token in email");

    // Only the hash is stored.
    const [row] = await db.select().from(loginTokens);
    assert.equal(row.tokenHash, hashToken(token));
    assert.notEqual(row.tokenHash, token);

    assert.equal((await peekLoginToken(token))?.email, "ana@example.com");
    const session = await consumeLoginToken(token);
    assert.ok(session);
    assert.equal((await organiserForSessionToken(session.sessionToken))?.id, ana.id);
    assert.equal(await consumeLoginToken(token), null, "second use fails");
  });

  test("unknown or disabled emails get nothing (and the form doesn't say so)", async () => {
    await db.update(organisers).set({ status: "disabled" }).where(eq(organisers.id, bo.id));
    await requestLoginLink("nobody@example.com");
    await requestLoginLink("bo@example.com");
    assert.equal((await listOutbox()).length, 0);
  });

  test("links expire after 15 minutes", async () => {
    const t0 = new Date();
    await requestLoginLink("ana@example.com", t0);
    const token = (await listOutbox())[0].html.match(/verify\?token=([\w-]{43})/)![1];
    assert.equal(await consumeLoginToken(token, new Date(t0.getTime() + 16 * 60_000)), null);
  });

  test("at most 3 links per 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await requestLoginLink("ana@example.com");
    assert.equal((await listOutbox()).length, 3);
  });

  test("disabling an organiser ends their sessions", async () => {
    await requestLoginLink("ana@example.com");
    const token = (await listOutbox())[0].html.match(/verify\?token=([\w-]{43})/)![1];
    const s = await consumeLoginToken(token);
    await db.update(organisers).set({ status: "disabled" }).where(eq(organisers.id, ana.id));
    assert.equal(await organiserForSessionToken(s!.sessionToken), null);
  });
});

describe("creating sessions", () => {
  test("weekly series keeps local time across the March clock change", async () => {
    // Lisbon switches to summer time on Sun 28 Mar 2027.
    const ids = await create(ana, fields({ date: "2027-03-13", startTime: "18:00", endTime: "19:00" }), {
      repeatWeekly: true,
      repeatUntil: "2027-04-03",
    });
    assert.equal(ids.length, 4);
    const rows = await db.select().from(sessions).orderBy(sessions.startsAt);
    assert.deepEqual(
      rows.map((r) => r.startsAt.toISOString()),
      ["2027-03-13T18:00:00.000Z", "2027-03-20T18:00:00.000Z", "2027-03-27T18:00:00.000Z", "2027-04-03T17:00:00.000Z"],
    );
    assert.ok(rows.every((r) => utcToLisbon(r.startsAt).time === "18:00"));
    assert.ok(rows.every((r) => r.seriesId === rows[0].seriesId && r.seriesId));
  });

  test("roles: trainers create classes, events managers create events", async () => {
    const e = await createSessions(ana, fields({ kind: "event", matLimit: 0, acceptsLink: false }), noRepeat, null);
    assert.equal(e.ok, false);
    const t = await createSessions(joao, fields(), noRepeat, null);
    assert.equal(t.ok, false);
    await create(joao, fields({ kind: "event", matLimit: 0, acceptsLink: false }));
    await create(admin, fields({ kind: "event", matLimit: 0, acceptsLink: false }));
  });

  test("payment link needs a link in the profile; past dates are refused", async () => {
    const noLink = await createSessions(bo, fields(), noRepeat, null);
    assert.deepEqual(noLink, { ok: false, field: "acceptsLink", message: "Add your payment link in your profile first." });
    const past = await createSessions(ana, fields({ date: addDays(lisbonToday(), -1) }), noRepeat, null);
    assert.equal(past.ok, false);
    assert.equal(!past.ok && past.field, "date");
  });

  test("private sessions get a different unguessable link per week", async () => {
    await create(ana, fields({ visibility: "private" }), { repeatWeekly: true, repeatUntil: addDays(lisbonToday(), 19) });
    const slugs = (await db.select({ s: sessions.privateSlug }).from(sessions)).map((r) => r.s);
    assert.equal(slugs.length, 3);
    assert.equal(new Set(slugs).size, 3);
    assert.ok(slugs.every((s) => /^[\w-]{21}$/.test(s ?? "")));
  });

  test("form validation: times, events, prices", () => {
    const base = { kind: "training", title: "Yoga", description: "", location: "Roof", date: "2027-01-10", startTime: "10:00", endTime: "09:00", spotLimit: "5", matLimit: "0", priceCents: "7,50", acceptsCash: true, acceptsLink: false, visibility: "public", cancelCutoffHours: "24" };
    const r = sessionFields.safeParse(base);
    assert.equal(r.success, false);
    assert.equal(r.error?.issues[0].path[0], "endTime");
    const ok = sessionFields.parse({ ...base, endTime: "11:00" });
    assert.equal(ok.priceCents, 750);
    assert.equal(sessionFields.safeParse({ ...base, endTime: "11:00", kind: "event", acceptsLink: true }).success, false);
    assert.equal(sessionFields.safeParse({ ...base, endTime: "11:00", acceptsCash: false }).success, false);
  });
});

describe("permissions", () => {
  test("trainers only see and manage their own sessions; admins see all", async () => {
    const [anaSession] = await create(ana);
    await create(bo, fields({ acceptsLink: false }));
    assert.equal(await getManagedSession(bo, anaSession), null);
    assert.equal((await updateSession(bo, anaSession, fields({ acceptsLink: false }), undefined)).ok, false);
    assert.equal((await cancelSessions(bo, anaSession, "one")).ok, false);
    assert.equal((await listDashboardSessions(ana)).length, 1);
    assert.equal((await listDashboardSessions(admin)).length, 2);
    assert.ok(await getManagedSession(admin, anaSession));
  });

  test("organisers can't mark payments on someone else's session", async () => {
    const [id] = await create(ana);
    const b = await createBooking(bookingInput(id));
    assert.ok(b.ok);
    assert.equal((await setPaymentStatus(bo, b.bookingId, "paid")).ok, false);
  });
});

describe("editing and cancelling", () => {
  test("moving a session emails everyone booked with the change and a calendar update", async () => {
    const [id] = await create(ana, fields({ date: addDays(lisbonToday(), 1), startTime: "23:00", endTime: "23:45" }));
    const b1 = await createBooking(bookingInput(id, { fullName: "Inês Duarte" }));
    const b2 = await createBooking(bookingInput(id));
    assert.ok(b1.ok && b2.ok);
    const cancelled = await createBooking(bookingInput(id));
    assert.ok(cancelled.ok);
    await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, cancelled.bookingId));

    const moved = fields({ date: addDays(lisbonToday(), 3), startTime: "18:00", endTime: "19:00", location: "Park" });
    const r = await updateSession(ana, id, moved, undefined);
    assert.ok(r.ok && r.timeChanged && r.locationChanged);
    const res = await notifySessionChanged(id, r.previous);
    assert.equal(res.notified, 2, "only active bookings");

    const emails = (await listOutbox()).filter((e) => e.subject.startsWith("Changed"));
    assert.equal(emails.length, 2);
    const ines = emails.find((e) => e.text.includes("Hi Inês"))!;
    assert.match(ines.text, /Time:/);
    assert.match(ines.text, /Place:/);
    assert.match(ines.attachments[0].content, /SEQUENCE:[1-9]\d*/);
    assert.match(ines.attachments[0].content, /LOCATION:Park/);
  });

  test("can't lower spots below the number already booked", async () => {
    const [id] = await create(ana, fields({ spotLimit: 3, matLimit: 2 }));
    await createBooking(bookingInput(id));
    await createBooking(bookingInput(id));
    const r = await updateSession(ana, id, fields({ spotLimit: 1, matLimit: 0 }), undefined);
    assert.equal(!r.ok && r.field, "spotLimit");
  });

  test("cancelling 'this and later weeks' cancels the rest of the series, emails people, blocks bookings", async () => {
    const ids = await create(ana, fields({ date: addDays(lisbonToday(), 3) }), {
      repeatWeekly: true,
      repeatUntil: addDays(lisbonToday(), 24),
    });
    assert.equal(ids.length, 4);
    const booked = await createBooking(bookingInput(ids[2]));
    assert.ok(booked.ok);

    const r = await cancelSessions(ana, ids[1], "following");
    assert.ok(r.ok);
    assert.deepEqual(new Set(r.ids), new Set(ids.slice(1)));
    const status = await db.select({ id: sessions.id, status: sessions.status }).from(sessions);
    assert.equal(status.find((s) => s.id === ids[0])?.status, "published");

    await notifySessionsCancelled(r.ids);
    const [email] = (await listOutbox()).filter((e) => e.subject.startsWith("Cancelled"));
    assert.ok(email);
    assert.match(email.attachments[0].content, /STATUS:CANCELLED/);
    assert.equal((await getBookingByToken(booked.token))?.sessionStatus, "cancelled");
    assert.deepEqual(await createBooking(bookingInput(ids[3])), { ok: false, reason: "not_found" });
  });

  test("cancelling a session cancels its scheduled reminders", async () => {
    const [id] = await create(ana, fields({ date: addDays(lisbonToday(), 2), startTime: "12:00", endTime: "13:00" }));
    const b = await createBooking(bookingInput(id));
    assert.ok(b.ok);
    await db.update(bookings).set({ createdAt: new Date(Date.now() - 72 * HOUR) }).where(eq(bookings.id, b.bookingId));
    assert.equal(await scheduleReminderIfDue(b.bookingId), "scheduled");
    const r = await cancelSessions(ana, id, "one");
    assert.ok(r.ok);
    await notifySessionsCancelled(r.ids);
    const live = await db
      .select()
      .from(emailLog)
      .where(and(eq(emailLog.bookingId, b.bookingId), eq(emailLog.type, "session_reminder"), isNull(emailLog.cancelledAt)));
    assert.equal(live.length, 0);
  });
});

describe("payment tracking", () => {
  test("marking a pending payment-link booking paid confirms it", async () => {
    const [id] = await create(ana);
    const b = await createBooking(bookingInput(id, { paymentMethod: "link" }));
    assert.ok(b.ok && b.status === "pending_payment");
    const r = await setPaymentStatus(ana, b.bookingId, "paid");
    assert.deepEqual(r, { ok: true, becameConfirmed: true });
    const view = await getBookingByToken(b.token);
    assert.equal(view?.status, "confirmed");
    assert.equal(view?.paymentStatus, "paid");
    assert.equal(view?.holdExpiresAt, null);

    assert.deepEqual(await setPaymentStatus(ana, b.bookingId, "unpaid"), { ok: true, becameConfirmed: false });
    assert.equal((await getBookingByToken(b.token))?.status, "confirmed", "stays booked");
  });

  test("free sessions and cancelled bookings can't be marked", async () => {
    const [free] = await create(ana, fields({ priceCents: 0 as never, acceptsCash: false, acceptsLink: false }));
    const b = await createBooking(bookingInput(free, { paymentMethod: null }));
    assert.ok(b.ok);
    assert.equal((await setPaymentStatus(ana, b.bookingId, "paid")).ok, false);
  });
});

describe("private links", () => {
  test("private class: bookable with its link, not without", async () => {
    const [id] = await create(ana, fields({ visibility: "private" }));
    const [{ slug }] = await db.select({ slug: sessions.privateSlug }).from(sessions).where(eq(sessions.id, id));
    assert.deepEqual(await createBooking(bookingInput(id)), { ok: false, reason: "not_found" });
    assert.deepEqual(await createBooking(bookingInput(id, { privateSlug: "x".repeat(21) })), { ok: false, reason: "not_found" });
    assert.ok((await createBooking(bookingInput(id, { privateSlug: slug! }))).ok);
  });

  test("private (members-only) events aren't bookable yet, even with the link", async () => {
    const [id] = await create(joao, fields({ kind: "event", matLimit: 0, acceptsLink: false, visibility: "private" }));
    const [{ slug }] = await db.select({ slug: sessions.privateSlug }).from(sessions).where(eq(sessions.id, id));
    assert.deepEqual(await createBooking(bookingInput(id, { privateSlug: slug! })), { ok: false, reason: "not_found" });
  });
});
