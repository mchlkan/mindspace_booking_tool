import { CalendarDays, Clock, Flower2, MapPin, Sun, Users } from "lucide-react";
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
  const KindIcon = session.kind === "training" ? Flower2 : Sun;

  return (
    <article className="overflow-hidden rounded-2xl bg-cream-50 shadow-sm ring-1 ring-sand-200">
      <div className={`flex h-24 items-end justify-between px-5 pb-3 ${TINTS[index % TINTS.length]}`}>
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">
          {session.kind === "training" ? "Class" : "Event"}
        </span>
        <KindIcon className="size-10 opacity-80" {...iconProps} />
      </div>

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
          <span className="text-sm text-stone-500">Booking opens soon</span>
        </div>
      </div>
    </article>
  );
}
