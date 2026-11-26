/**
 * Booking rules, tested against a throwaway in-memory Postgres (PGlite).
 * Run with `npm test`.
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { db, schema } from "@/db";
import { bookingInput, createBooking, getBookingByToken, reportPaid, type BookingInput } from "@/lib/booking";

const { organisers, sessions, bookings } = schema;
const HOUR = 3_600_000;

let trainerId: string;
let noLinkTrainerId: string;

before(async () => {
  assert.equal(process.env.DATABASE_URL, undefined, "Tests must not run against a real database");
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await db.execute(sql`truncate bookings, sessions, organisers cascade`);
  const [t, n] = await db
    .insert(organisers)
    .values([
      { email: "t@example.com", name: "Ana", role: "trainer", status: "approved", paymentLink: "https://pay.example/ana" },
      { email: "n@example.com", name: "Bo", role: "trainer", status: "approved" },
    ])
    .returning();
  trainerId = t.id;
  noLinkTrainerId = n.id;
});

async function makeSession(overrides: Partial<typeof sessions.$inferInsert> = {}) {
  const startsAt = new Date(Date.now() + 72 * HOUR);
  const [s] = await db
    .insert(sessions)
    .values({
      kind: "training",
      organiserId: trainerId,
      title: "Yoga",
      location: "Rooftop",
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      spotLimit: 3,
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
    fullName: "Test Person",
    email: `p${Math.random().toString(36).slice(2)}@example.com`,
    matRequested: false,
    paymentMethod: "cash",
    consent: true,
    ...overrides,
  };
}

async function activeCount(sessionId: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.sessionId, sessionId));
  return rows.filter((b) => b.status === "confirmed" || b.status === "pending_payment").length;
}

describe("createBooking", () => {
  test("cash booking is confirmed straight away and unpaid", async () => {
    const s = await makeSession();
    const r = await createBooking(input(s.id, { paymentMethod: "cash" }));
    assert.ok(r.ok);
    assert.equal(r.status, "confirmed");
    const b = await getBookingByToken(r.token);
    assert.equal(b?.paymentStatus, "unpaid");
    assert.equal(b?.holdExpiresAt, null);
  });

  test("payment-link booking is pending with a 24 h hold", async () => {
    const s = await makeSession();
    const r = await createBooking(input(s.id, { paymentMethod: "link" }));
    assert.ok(r.ok);
    assert.equal(r.status, "pending_payment");
    const b = await getBookingByToken(r.token);
    const hold = b!.holdExpiresAt!.getTime() - Date.now();
    assert.ok(hold > 23.9 * HOUR && hold <= 24 * HOUR, `hold was ${hold / HOUR} h`);
  });

  test("hold never outlasts the session start", async () => {
    const startsAt = new Date(Date.now() + 5 * HOUR);
    const s = await makeSession({ startsAt, endsAt: new Date(startsAt.getTime() + HOUR) });
    const r = await createBooking(input(s.id, { paymentMethod: "link" }));
    assert.ok(r.ok);
    const b = await getBookingByToken(r.token);
    assert.equal(b!.holdExpiresAt!.getTime(), startsAt.getTime());
  });

  test("free sessions need no payment method", async () => {
    const s = await makeSession({ priceCents: 0, acceptsCash: false, acceptsLink: false });
    const r = await createBooking(input(s.id, { paymentMethod: null }));
    assert.ok(r.ok);
    assert.equal(r.status, "confirmed");
    assert.equal((await getBookingByToken(r.token))?.paymentMethod, null);
  });

  test("rejects a payment method the session doesn't offer", async () => {
    const cashOnly = await makeSession({ acceptsLink: false });
    assert.deepEqual(await createBooking(input(cashOnly.id, { paymentMethod: "link" })), {
      ok: false,
      reason: "payment_method",
    });
    assert.deepEqual(await createBooking(input(cashOnly.id, { paymentMethod: null })), {
      ok: false,
      reason: "payment_method",
    });
  });

  test("rejects payment link when the trainer has no link set up", async () => {
    const s = await makeSession({ organiserId: noLinkTrainerId });
    const r = await createBooking(input(s.id, { paymentMethod: "link" }));
    assert.deepEqual(r, { ok: false, reason: "payment_method" });
  });

  test("same email can't book the same session twice (case-insensitive)", async () => {
    const s = await makeSession();
    assert.ok((await createBooking(input(s.id, { email: "marta@example.com" }))).ok);
    const again = await createBooking(input(s.id, { email: "MARTA@example.com" }));
    assert.deepEqual(again, { ok: false, reason: "already_booked" });
  });

  test("session at capacity reports full", async () => {
    const s = await makeSession({ spotLimit: 2 });
    assert.ok((await createBooking(input(s.id))).ok);
    assert.ok((await createBooking(input(s.id, { paymentMethod: "link" }))).ok); // pending holds count
    assert.deepEqual(await createBooking(input(s.id)), { ok: false, reason: "full" });
  });

  test("simultaneous bookings for the last spot: exactly one wins", async () => {
    const s = await makeSession({ spotLimit: 1 });
    const results = await Promise.all(Array.from({ length: 8 }, () => createBooking(input(s.id))));
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "full"));
    assert.equal(await activeCount(s.id), 1);
  });

  test("mat limit is enforced; booking without a mat still works", async () => {
    const s = await makeSession({ matLimit: 1 });
    assert.ok((await createBooking(input(s.id, { matRequested: true }))).ok);
    assert.deepEqual(await createBooking(input(s.id, { matRequested: true })), { ok: false, reason: "mats_full" });
    assert.ok((await createBooking(input(s.id, { matRequested: false }))).ok);
  });

  test("events don't offer mats", async () => {
    const s = await makeSession({ kind: "event", matLimit: 0, acceptsLink: false });
    assert.deepEqual(await createBooking(input(s.id, { matRequested: true })), { ok: false, reason: "no_mats" });
  });

  test("an expired hold frees the spot and lets the same person book again", async () => {
    const s = await makeSession({ spotLimit: 1 });
    const first = await createBooking(input(s.id, { email: "late@example.com", paymentMethod: "link" }));
    assert.ok(first.ok);
    assert.deepEqual(await createBooking(input(s.id)), { ok: false, reason: "full" });

    await db
      .update(bookings)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(bookings.cancelToken, first.token));
    assert.equal((await getBookingByToken(first.token))?.status, "expired");

    const again = await createBooking(input(s.id, { email: "late@example.com", paymentMethod: "cash" }));
    assert.ok(again.ok, JSON.stringify(again));
    assert.equal(await activeCount(s.id), 1);
  });

  test("can't book sessions that started, are cancelled or private", async () => {
    const past = new Date(Date.now() - HOUR);
    const started = await makeSession({ startsAt: past, endsAt: new Date(past.getTime() + 2 * HOUR) });
    const cancelled = await makeSession({ status: "cancelled" });
    const priv = await makeSession({ visibility: "private", privateSlug: "x".repeat(21) });
    assert.deepEqual(await createBooking(input(started.id)), { ok: false, reason: "started" });
    assert.deepEqual(await createBooking(input(cancelled.id)), { ok: false, reason: "not_found" });
    assert.deepEqual(await createBooking(input(priv.id)), { ok: false, reason: "not_found" });
    assert.deepEqual(await createBooking(input(crypto.randomUUID())), { ok: false, reason: "not_found" });
  });
});

describe("reportPaid", () => {
  test("confirms a pending payment-link booking once", async () => {
    const s = await makeSession();
    const r = await createBooking(input(s.id, { paymentMethod: "link" }));
    assert.ok(r.ok);
    assert.equal(await reportPaid(r.token), true);
    const b = await getBookingByToken(r.token);
    assert.equal(b?.status, "confirmed");
    assert.equal(b?.paymentStatus, "reported_paid");
    assert.equal(b?.holdExpiresAt, null);
    assert.equal(await reportPaid(r.token), false);
  });

  test("does nothing for cash bookings, expired holds or unknown tokens", async () => {
    const s = await makeSession();
    const cash = await createBooking(input(s.id, { paymentMethod: "cash" }));
    const link = await createBooking(input(s.id, { paymentMethod: "link" }));
    assert.ok(cash.ok && link.ok);
    await db
      .update(bookings)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(bookings.cancelToken, link.token));
    assert.equal(await reportPaid(cash.token), false);
    assert.equal(await reportPaid(link.token), false);
    assert.equal(await reportPaid("nope"), false);
  });
});

describe("bookingInput validation", () => {
  const base = {
    sessionId: crypto.randomUUID(),
    fullName: "Ana Costa",
    email: "Ana@Example.com ",
    matRequested: false,
    paymentMethod: "cash",
    consent: true,
  };

  test("normalises email and trims name", () => {
    const r = bookingInput.parse({ ...base, fullName: "  Ana Costa " });
    assert.equal(r.email, "ana@example.com");
    assert.equal(r.fullName, "Ana Costa");
  });

  test("requires consent, a real email and a name", () => {
    assert.equal(bookingInput.safeParse({ ...base, consent: false }).success, false);
    assert.equal(bookingInput.safeParse({ ...base, email: "not-an-email" }).success, false);
    assert.equal(bookingInput.safeParse({ ...base, fullName: " " }).success, false);
  });
});
