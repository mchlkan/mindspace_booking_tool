import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const organiserRole = pgEnum("organiser_role", [
  "trainer",
  "events_manager",
  "admin",
]);

export const organiserStatus = pgEnum("organiser_status", [
  "pending",
  "approved",
  "disabled",
]);

export const sessionKind = pgEnum("session_kind", ["training", "event"]);

export const sessionVisibility = pgEnum("session_visibility", [
  "public",
  "private",
]);

export const sessionStatus = pgEnum("session_status", [
  "published",
  "cancelled",
]);

export const paymentMethod = pgEnum("payment_method", ["cash", "link"]);

/** Lifecycle of a booking (does it hold a spot?). */
export const bookingStatus = pgEnum("booking_status", [
  "confirmed", // holds a spot (cash, or payment-link booking marked paid/reported)
  "pending_payment", // payment-link booking: holds a spot until hold_expires_at
  "cancelled", // cancelled by participant or because the session was cancelled
  "expired", // pending hold ran out unpaid
]);

/** Payment tracking only: no money passes through the app. */
export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "reported_paid", // participant clicked "I've paid"
  "paid", // organiser confirmed
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Trainers, events managers and admins. Participants never get an account. */
export const organisers = pgTable(
  "organisers",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text().notNull(),
    photoUrl: text(),
    paymentLink: text(),
    role: organiserRole().notNull(),
    status: organiserStatus().notNull().default("pending"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organisers_email_idx").on(sql`lower(${t.email})`)],
);

/** Admin-maintained list of club member emails (for private events). */
export const members = pgTable(
  "members",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("members_email_idx").on(sql`lower(${t.email})`)],
);

/** A weekly recurring class. Generates one row in `sessions` per week. */
export const series = pgTable(
  "series",
  {
    id: uuid().primaryKey().defaultRandom(),
    organiserId: uuid()
      .notNull()
      .references(() => organisers.id),
    weekday: smallint().notNull(), // 0 = Sunday … 6 = Saturday
    startTime: time().notNull(), // local time, Europe/Lisbon
    durationMinutes: integer().notNull(),
    startsOn: date().notNull(),
    endsOn: date(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("series_weekday_range", sql`${t.weekday} between 0 and 6`)],
);

/** A single bookable class (training) or club event. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: sessionKind().notNull(),
    organiserId: uuid()
      .notNull()
      .references(() => organisers.id),
    seriesId: uuid().references(() => series.id),
    title: text().notNull(),
    description: text().notNull().default(""),
    location: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    spotLimit: integer().notNull(),
    matLimit: integer().notNull().default(0), // trainings only
    priceCents: integer().notNull().default(0), // EUR
    acceptsCash: boolean().notNull().default(true),
    acceptsLink: boolean().notNull().default(false), // trainings only
    visibility: sessionVisibility().notNull().default("public"),
    /** Unguessable URL slug for private sessions (nanoid, 21 chars). */
    privateSlug: text().unique(),
    bannerUrl: text(),
    status: sessionStatus().notNull().default("published"),
    cancelCutoffHours: integer().notNull().default(24),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_starts_at_idx").on(t.startsAt),
    index("sessions_organiser_idx").on(t.organiserId),
    check("sessions_spot_limit_positive", sql`${t.spotLimit} > 0`),
    check("sessions_mat_limit_nonneg", sql`${t.matLimit} >= 0`),
    check("sessions_price_nonneg", sql`${t.priceCents} >= 0`),
    check("sessions_ends_after_start", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "sessions_has_payment_method",
      sql`${t.priceCents} = 0 or ${t.acceptsCash} or ${t.acceptsLink}`,
    ),
    check(
      "sessions_private_has_slug",
      sql`${t.visibility} = 'public' or ${t.privateSlug} is not null`,
    ),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    fullName: text().notNull(),
    email: text().notNull(),
    matRequested: boolean().notNull().default(false),
    paymentMethod: paymentMethod(), // null for free sessions
    status: bookingStatus().notNull(),
    paymentStatus: paymentStatus().notNull().default("unpaid"),
    /** Payment-link bookings only: spot is released after this time if unpaid. */
    holdExpiresAt: timestamp({ withTimezone: true }),
    /** Secret for the cancel link in the confirmation email. */
    cancelToken: text().notNull().unique(),
    consentAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("bookings_session_idx").on(t.sessionId),
    index("bookings_email_idx").on(sql`lower(${t.email})`),
    // One active booking per person per session.
    uniqueIndex("bookings_one_active_per_email")
      .on(t.sessionId, sql`lower(${t.email})`)
      .where(sql`${t.status} in ('confirmed', 'pending_payment')`),
  ],
);

/** One-time codes for member verification on private events. */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    codeHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: smallint().notNull().default(0),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_codes_email_idx").on(sql`lower(${t.email})`)],
);

/** Record of sent emails: prevents duplicate reminders, aids debugging. */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: text().notNull(), // e.g. booking_confirmed, session_reminder
    toEmail: text().notNull(),
    bookingId: uuid().references(() => bookings.id, { onDelete: "set null" }),
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    /** Resend email id, or "local-…" / "skipped-…" when Resend isn't configured. */
    resendId: text(),
    /** Set for emails scheduled to go out later (e.g. 24 h reminders). */
    scheduledFor: timestamp({ withTimezone: true }),
    /** Set when a scheduled email was cancelled before it went out. */
    cancelledAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_log_booking_idx").on(t.bookingId),
    // At most one live reminder per booking, even if two jobs race.
    uniqueIndex("email_log_one_reminder_per_booking")
      .on(t.bookingId, t.type)
      .where(sql`${t.type} = 'session_reminder' and ${t.cancelledAt} is null`),
  ],
);
