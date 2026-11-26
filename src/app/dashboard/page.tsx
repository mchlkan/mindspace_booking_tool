import { CalendarDays, Clock, Lock, MapPin, Repeat, Users } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, primaryButtonClass } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { formatDay, formatPrice, formatTime } from "@/lib/format";
import { listDashboardSessions } from "@/lib/organiser";

export default function DashboardPage() {
  return (
    <Suspense fallback={<Card className="h-64 animate-pulse">{null}</Card>}>
      <Sessions />
    </Suspense>
  );
}

const icon = { strokeWidth: 1.25, "aria-hidden": true, className: "size-4 shrink-0" } as const;

async function Sessions() {
  await connection();
  const me = await requireOrganiser();
  const all = await listDashboardSessions(me);
  const upcoming = all.filter((s) => !s.ended);
  const past = all.filter((s) => s.ended).reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-extrabold text-navy-700">Hi {me.name.split(/\s+/)[0]}!</h1>
          <p className="text-ink-500">
            {me.role === "admin" ? "All upcoming sessions." : "Your upcoming sessions, bookings and payments."}
          </p>
        </div>
        <div className="hidden shrink-0 sm:block">
          <Link href="/dashboard/sessions/new" className={primaryButtonClass}>
            + New session
          </Link>
        </div>
      </div>

      {upcoming.length === 0 ? (
        <Card className="space-y-3 text-center">
          <p className="text-ink-700">No upcoming sessions yet.</p>
          <Link href="/dashboard/sessions/new" className={primaryButtonClass}>
            Create your first session
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((s) => (
            <SessionRow key={s.id} s={s} showOrganiser={me.role === "admin"} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-2 font-semibold text-navy-500">Past two weeks ({past.length})</summary>
          <ul className="mt-2 space-y-3 opacity-80">
            {past.map((s) => (
              <SessionRow key={s.id} s={s} showOrganiser={me.role === "admin"} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof listDashboardSessions>>[number];

function SessionRow({ s, showOrganiser }: { s: Row; showOrganiser: boolean }) {
  const cancelled = s.status === "cancelled";
  return (
    <li>
      <Link
        href={`/dashboard/sessions/${s.id}`}
        className="block rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-sand-200 transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-bold text-navy-700 ${cancelled ? "line-through" : ""}`}>{s.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
              <span className="flex items-center gap-1.5">
                <CalendarDays {...icon} />
                {formatDay(s.startsAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock {...icon} />
                {formatTime(s.startsAt)}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin {...icon} />
                <span className="truncate">{s.location}</span>
              </span>
            </p>
            {showOrganiser && <p className="mt-1 text-sm text-ink-500">by {s.organiserName}</p>}
          </div>
          <span className="shrink-0 text-sm font-semibold text-navy-700">{formatPrice(s.priceCents)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {cancelled ? (
            <Chip tone="muted">Cancelled</Chip>
          ) : (
            <>
              <Chip tone={s.spotsTaken >= s.spotLimit ? "navy" : "sun"}>
                <Users {...icon} className="size-3.5" />
                {s.spotsTaken}/{s.spotLimit} booked
              </Chip>
              {s.kind === "training" && s.matLimit > 0 && (
                <Chip tone="sand">
                  {s.matsTaken}/{s.matLimit} mats
                </Chip>
              )}
              {s.unpaid > 0 && <Chip tone="sand">{s.unpaid} unpaid</Chip>}
            </>
          )}
          {s.visibility === "private" && (
            <Chip tone="sand">
              <Lock {...icon} className="size-3.5" />
              Private
            </Chip>
          )}
          {s.seriesId && (
            <Chip tone="sand">
              <Repeat {...icon} className="size-3.5" />
              Weekly
            </Chip>
          )}
        </div>
      </Link>
    </li>
  );
}

function Chip({ tone, children }: { tone: "sun" | "navy" | "sand" | "muted"; children: React.ReactNode }) {
  const tones = {
    sun: "bg-sun-300 text-navy-700",
    navy: "bg-navy-500 text-cream-50",
    sand: "bg-sand-200 text-ink-900",
    muted: "bg-stone-300 text-ink-700",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${tones[tone]}`}>{children}</span>;
}
