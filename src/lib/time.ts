/**
 * Lisbon wall-clock time ↔ UTC. Organisers type local dates and times;
 * the database stores UTC. Handles summer/winter time per date, so a weekly
 * 18:00 class stays at 18:00 local after the clocks change.
 */
export const TZ = "Europe/Lisbon";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Lisbon's UTC offset at a given instant, in milliseconds. */
function offsetAt(d: Date) {
  const { date, time } = parts(d);
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  return asUtc - Math.floor(d.getTime() / 60_000) * 60_000;
}

/** "2026-12-05" + "07:30" in Lisbon → UTC Date. */
export function lisbonToUtc(date: string, time: string): Date {
  const guess = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(guess)) throw new Error(`Invalid date/time: ${date} ${time}`);
  let utc = guess - offsetAt(new Date(guess));
  const second = offsetAt(new Date(utc));
  if (second !== guess - utc) utc = guess - second;
  return new Date(utc);
}

/** UTC Date → Lisbon { date: "YYYY-MM-DD", time: "HH:MM" } (for form defaults). */
export function utcToLisbon(d: Date) {
  return parts(d);
}

/** Adds whole days to a "YYYY-MM-DD" date string. */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in Lisbon, "YYYY-MM-DD". */
export function lisbonToday(now = new Date()) {
  return parts(now).date;
}
