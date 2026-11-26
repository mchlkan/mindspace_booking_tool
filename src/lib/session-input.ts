import { z } from "zod";
import { addDays, lisbonToUtc } from "@/lib/time";

/** Longest a weekly series can run when created (one semester-ish). */
export const MAX_SERIES_WEEKS = 26;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a date.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Please pick a time.");
const euros = z
  .string()
  .trim()
  .transform((s) => s.replace(",", ".") || "0")
  .pipe(z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, "Enter a price like 5 or 7.50."))
  .transform((s) => Math.round(Number(s) * 100));
const count = (label: string, min: number) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(500, `${label} is too large.`);

/** Fields shared by create and edit. Times are Lisbon local. */
export const sessionFields = z
  .object({
    kind: z.enum(["training", "event"]),
    title: z.string().trim().min(3, "Please add a title.").max(80, "Keep the title under 80 characters."),
    description: z.string().trim().max(2000, "Keep the description under 2000 characters."),
    location: z.string().trim().min(2, "Where does it take place?").max(120),
    date,
    startTime: time,
    endTime: time,
    spotLimit: count("Spots", 1),
    matLimit: count("Mats", 0),
    priceCents: euros,
    acceptsCash: z.boolean(),
    acceptsLink: z.boolean(),
    visibility: z.enum(["public", "private"]),
    cancelCutoffHours: count("Cancellation cutoff", 0).max(168, "At most 7 days (168 h)."),
  })
  .superRefine((v, ctx) => {
    if (v.endTime <= v.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after the start time." });
    }
    if (v.kind === "event") {
      if (v.acceptsLink) ctx.addIssue({ code: "custom", path: ["acceptsLink"], message: "Events are paid in cash on site." });
      if (v.matLimit > 0) ctx.addIssue({ code: "custom", path: ["matLimit"], message: "Events don't lend mats." });
    }
    if (v.matLimit > v.spotLimit) {
      ctx.addIssue({ code: "custom", path: ["matLimit"], message: "More mats than spots? Lower the mat count." });
    }
    if (v.priceCents > 0 && !v.acceptsCash && !v.acceptsLink) {
      ctx.addIssue({ code: "custom", path: ["acceptsCash"], message: "Choose at least one way to pay." });
    }
  });

export const repeatFields = z
  .object({
    repeatWeekly: z.boolean(),
    repeatUntil: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.repeatWeekly && !/^\d{4}-\d{2}-\d{2}$/.test(v.repeatUntil)) {
      ctx.addIssue({ code: "custom", path: ["repeatUntil"], message: "Until when should it repeat?" });
    }
  });

export type SessionFields = z.infer<typeof sessionFields>;

/** Reads the session form. Checkboxes are "on" when ticked. */
export function readSessionForm(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    kind: s("kind"),
    title: s("title"),
    description: s("description"),
    location: s("location"),
    date: s("date"),
    startTime: s("startTime"),
    endTime: s("endTime"),
    spotLimit: s("spotLimit"),
    matLimit: s("matLimit") || "0",
    priceCents: s("price"),
    acceptsCash: fd.get("acceptsCash") === "on",
    acceptsLink: fd.get("acceptsLink") === "on",
    visibility: s("visibility") || "public",
    cancelCutoffHours: s("cancelCutoffHours") || "24",
    repeatWeekly: fd.get("repeatWeekly") === "on",
    repeatUntil: s("repeatUntil"),
  };
}

/** UTC start/end for every occurrence (one, or one per week until `until`). */
export function occurrences(f: Pick<SessionFields, "date" | "startTime" | "endTime">, until?: string) {
  const dates = [f.date];
  if (until) {
    for (let d = addDays(f.date, 7); d <= until && dates.length < MAX_SERIES_WEEKS; d = addDays(d, 7)) dates.push(d);
  }
  return dates.map((d) => ({ startsAt: lisbonToUtc(d, f.startTime), endsAt: lisbonToUtc(d, f.endTime) }));
}

/** Maps zod issues to { field: first message } for the form. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key === "priceCents" ? "price" : key] ??= issue.message;
  }
  return out;
}
