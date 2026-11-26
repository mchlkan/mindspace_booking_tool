import { CalendarDays, Clock, MapPin, UserRound } from "lucide-react";
import { formatDay, formatTime } from "@/lib/format";

const iconProps = { strokeWidth: 1.25, "aria-hidden": true } as const;

/** Date, time, place (and optionally host) with the brand's fine-line icons. */
export function SessionFacts({
  startsAt,
  endsAt,
  location,
  host,
}: {
  startsAt: Date;
  endsAt: Date;
  location: string;
  host?: string;
}) {
  return (
    <ul className="space-y-1.5 text-[15px] text-ink-500">
      <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0" {...iconProps} />
          {formatDay(startsAt)}
        </span>
        <span className="flex items-center gap-2">
          <Clock className="ml-2 size-4 shrink-0" {...iconProps} />
          {formatTime(startsAt)}–{formatTime(endsAt)}
        </span>
      </li>
      <li className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0" {...iconProps} />
        {location}
      </li>
      {host && (
        <li className="flex items-center gap-2">
          <UserRound className="size-4 shrink-0" {...iconProps} />
          With {host}
        </li>
      )}
    </ul>
  );
}
