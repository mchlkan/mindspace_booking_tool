import { appUrl } from "@/lib/app-url";
import { getBookingByToken } from "@/lib/booking";
import { bookingIcs } from "@/lib/calendar";

/** "Add to calendar" download for a booking (same event as the email attachment). */
export async function GET(_req: Request, ctx: RouteContext<"/b/[token]/calendar.ics">) {
  const { token } = await ctx.params;
  const booking = await getBookingByToken(token);
  if (!booking) return new Response("Not found", { status: 404 });

  const url = appUrl(`/b/${token}`);
  const ics = bookingIcs({
    bookingId: booking.bookingId,
    title: `${booking.title} · Mindspace`,
    description: `${booking.description}\n\nYour booking: ${url}`.trim(),
    location: booking.location,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    url,
    cancelled: booking.status === "cancelled" || booking.sessionStatus === "cancelled",
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mindspace-session.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
