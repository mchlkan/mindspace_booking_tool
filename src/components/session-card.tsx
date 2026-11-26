import { ArrowRight, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { SessionBanner } from "@/components/session-banner";
import type { SessionSummary } from "@/lib/sessions";
import { formatDay, formatPrice, formatTime } from "@/lib/format";

/**
 * Brand rule (book p.18): the same colour shouldn't sit next to itself.
 * Cards cycle through these banner tints in order.
 */
const TINTS = [
  "bg-navy-500 text-sun-300",
  "bg-sun-300 text-navy-700",
  "bg-sand-200 text-navy-700",
  "bg-slate-400 text-cream-50",
] as const;

const iconProps = { strokeWidth: 1.25, "aria-hidden": true } as const;

export function SessionCard({ session, index }: { session: SessionSummary; index: number }) {
  const full = session.spotsLeft === 0;

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="block overflow-hidden rounded-2xl bg-cream-50 shadow-sm ring-1 ring-sand-200 transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none"
    >
      <article>
        <SessionBanner
          kind={session.kind}
          bannerUrl={session.bannerUrl}
          fallbackTint={TINTS[index % TINTS.length]}
          heightClass={session.bannerUrl ? "h-40" : "h-24"}
          eager={index === 0}
        />

        <div className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl leading-tight font-bold text-navy-700">{session.title}</h2>
            <span className="shrink-0 pt-0.5 text-lg font-semibold text-navy-700">
              {formatPrice(session.priceCents)}
            </span>
          </div>

          <ul className="space-y-1.5 text-[15px] text-ink-500">
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4" {...iconProps} />
              {formatDay(session.startsAt)}
              <Clock className="ml-2 size-4" {...iconProps} />
              {formatTime(session.startsAt)}–{formatTime(session.endsAt)}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4" {...iconProps} />
              {session.location}
            </li>
          </ul>

          <div className="flex items-center justify-between pt-1">
            {full ? (
              <span className="rounded-full bg-stone-300 px-3 py-1 text-sm font-semibold text-ink-700">
                Full
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-300 px-3 py-1 text-sm font-semibold text-navy-700">
                <Users className="size-4" {...iconProps} />
                {session.spotsLeft} {session.spotsLeft === 1 ? "spot" : "spots"} left
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-semibold text-navy-500">
              {full ? "Details" : "Book"}
              <ArrowRight className="size-4" {...iconProps} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
