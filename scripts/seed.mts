/**
 * Resets the database to demo data. Wipes all rows first.
 * Against Neon (DATABASE_URL set) it refuses unless SEED_ALLOW_REMOTE=1,
 * so it can't wipe real bookings by accident.
 */
import { nanoid } from "nanoid";
import { openDb } from "./db.mts";
import * as s from "../src/db/schema.ts";

if (process.env.DATABASE_URL && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(
    "Refusing to seed a remote database. Set SEED_ALLOW_REMOTE=1 if you really mean it (this deletes all data).",
  );
  process.exit(1);
}

/** A Date for `daysFromNow` at hh:mm local time in Lisbon. */
function lisbon(daysFromNow: number, hh: number, mm = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  const ymd = d.toISOString().slice(0, 10);
  const guess = new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    timeZoneName: "shortOffset",
  })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")!
    .value.match(/GMT([+-]\d+)?/)![1];
  return new Date(guess.getTime() - Number(offset ?? 0) * 3_600_000);
}

const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const { db, target, close } = await openDb();
console.log(`Seeding ${target}…`);

await db.transaction(async (tx) => {
  for (const t of [s.emailLog, s.otpCodes, s.bookings, s.sessions, s.series, s.members, s.organisers]) {
    await tx.delete(t);
  }

  const [admin, ana, joao, rita] = await tx
    .insert(s.organisers)
    .values([
      { email: "admin@example.com", name: "Mindspace Admin", role: "admin", status: "approved" },
      {
        email: "ana.trainer@example.com",
        name: "Ana Costa",
        role: "trainer",
        status: "approved",
        paymentLink: "https://example.com/pay/ana",
      },
      { email: "joao.events@example.com", name: "João Silva", role: "events_manager", status: "approved" },
      { email: "rita.new@example.com", name: "Rita Mendes", role: "trainer", status: "pending" },
    ])
    .returning();
  void admin;
  void rita;

  await tx
    .insert(s.members)
    .values(["member1@example.com", "member2@example.com", "member3@example.com"].map((email) => ({ email })));

  // Weekly sunrise yoga (series + next 3 occurrences).
  const [yogaSeries] = await tx
    .insert(s.series)
    .values({
      organiserId: ana.id,
      weekday: lisbon(2, 0).getUTCDay(),
      startTime: "07:30",
      durationMinutes: 60,
      startsOn: lisbon(2, 12).toISOString().slice(0, 10),
    })
    .returning();

  const yoga = await tx
    .insert(s.sessions)
    .values(
      [2, 9, 16].map((day) => {
        const start = lisbon(day, 7, 30);
        return {
          kind: "training" as const,
          organiserId: ana.id,
          seriesId: yogaSeries.id,
          title: "Sunrise Yoga",
          description:
            "Start your day by creating space for yourself. A gentle vinyasa flow for all levels: no experience needed.",
          location: "Nova SBE, Rooftop terrace",
          startsAt: start,
          endsAt: minutes(start, 60),
          spotLimit: 12,
          matLimit: 6,
          priceCents: 500,
          acceptsCash: true,
          acceptsLink: true,
        };
      }),
    )
    .returning();

  const [pilates, meditation] = await tx
    .insert(s.sessions)
    .values([
      {
        kind: "training",
        organiserId: ana.id,
        title: "Core Pilates",
        description: "Strength, balance and breath. Bring water and comfy clothes.",
        location: "Nova SBE, Room B-104",
        startsAt: lisbon(3, 18),
        endsAt: minutes(lisbon(3, 18), 50),
        spotLimit: 2, // small on purpose: shows the "Full" state once booked
        matLimit: 2,
        priceCents: 600,
        acceptsCash: true,
        acceptsLink: true,
      },
      {
        kind: "training",
        organiserId: ana.id,
        title: "Exam-Season Meditation",
        description: "A 30-minute guided session to calm the mind before exams.",
        location: "Nova SBE, Quiet room",
        startsAt: lisbon(4, 13),
        endsAt: minutes(lisbon(4, 13), 30),
        spotLimit: 20,
        matLimit: 0,
        priceCents: 0,
        acceptsCash: false,
        acceptsLink: false,
        visibility: "private",
        privateSlug: nanoid(),
      },
    ])
    .returning();

  const [retreat] = await tx
    .insert(s.sessions)
    .values([
      {
        kind: "event",
        organiserId: joao.id,
        title: "Members' Beach Sunset Circle",
        description: "Breathwork and a shared picnic by the sea. Members only.",
        location: "Praia de Carcavelos",
        startsAt: lisbon(6, 17, 30),
        endsAt: minutes(lisbon(6, 17, 30), 120),
        spotLimit: 25,
        priceCents: 300,
        acceptsCash: true,
        visibility: "private",
        privateSlug: nanoid(),
      },
      {
        kind: "event",
        organiserId: joao.id,
        title: "Beginners Pottery Workshop",
        description: "Slow down and get your hands dirty. All materials included.",
        location: "Atelier Barro, Lisbon",
        startsAt: lisbon(10, 15),
        endsAt: minutes(lisbon(10, 15), 150),
        spotLimit: 10,
        priceCents: 1500,
        acceptsCash: true,
      },
    ])
    .returning();

  const now = new Date();
  await tx.insert(s.bookings).values([
    {
      sessionId: yoga[0].id,
      fullName: "Marta Pereira",
      email: "marta@example.com",
      matRequested: true,
      paymentMethod: "cash",
      status: "confirmed",
      cancelToken: nanoid(32),
      consentAt: now,
    },
    {
      sessionId: yoga[0].id,
      fullName: "Tomás Rocha",
      email: "tomas@example.com",
      paymentMethod: "link",
      status: "pending_payment",
      holdExpiresAt: new Date(now.getTime() + 24 * 3_600_000),
      cancelToken: nanoid(32),
      consentAt: now,
    },
    {
      sessionId: pilates.id,
      fullName: "Inês Duarte",
      email: "ines@example.com",
      matRequested: true,
      paymentMethod: "link",
      status: "confirmed",
      paymentStatus: "reported_paid",
      cancelToken: nanoid(32),
      consentAt: now,
    },
    {
      sessionId: pilates.id,
      fullName: "Leo Fischer",
      email: "leo@example.com",
      paymentMethod: "cash",
      status: "confirmed",
      cancelToken: nanoid(32),
      consentAt: now,
    },
    {
      sessionId: retreat.id,
      fullName: "Member One",
      email: "member1@example.com",
      paymentMethod: "cash",
      status: "confirmed",
      cancelToken: nanoid(32),
      consentAt: now,
    },
  ]);

  console.log(`Private meditation link: /s/${meditation.privateSlug}`);
  console.log(`Private event link:      /s/${retreat.privateSlug}`);
});

await close();
console.log("Seeded: 4 organisers, 3 members, 7 sessions, 5 bookings.");
