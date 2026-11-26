import { timingSafeEqual } from "node:crypto";
import { runReminderSweep } from "@/lib/notifications";

/**
 * Daily job (see vercel.json): schedules the 24 h reminder emails for
 * sessions starting in the next ~2 days. Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`. Locally (no CRON_SECRET, not on
 * Vercel) it can be opened directly to test.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.VERCEL) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const result = await runReminderSweep();
  if (result.errors.length) console.error("[cron] reminder errors", result.errors);
  return Response.json(result, { status: result.errors.length ? 500 : 200 });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
