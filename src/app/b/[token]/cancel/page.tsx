import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cancelBookingAction } from "@/app/actions";
import { SessionFacts } from "@/components/session-facts";
import { SiteHeader } from "@/components/site-header";
import { getBookingByToken } from "@/lib/booking";
import { formatDay, formatTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cancel booking · Mindspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const ERRORS: Record<string, string> = {
  too_late: "It's too close to the session to cancel online. Please reply to your confirmation email instead.",
  not_active: "This booking is no longer active, so there's nothing to cancel.",
  not_found: "We couldn't find this booking.",
};

/**
 * A confirmation step on purpose: the email link only opens this page, and
 * cancelling needs a button press, so link scanners in email clients can't
 * cancel bookings by "clicking" the link.
 */
export default function CancelPage({ params, searchParams }: PageProps<"/b/[token]/cancel">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-16">
        <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-cream-50 ring-1 ring-sand-200" />}>
          {Promise.all([params, searchParams]).then(([{ token }, sp]) => (
            <CancelConfirm token={token} error={typeof sp.error === "string" ? sp.error : undefined} />
          ))}
        </Suspense>
      </main>
    </>
  );
}

async function CancelConfirm({ token, error }: { token: string; error?: string }) {
  await connection();
  const booking = await getBookingByToken(token);
  if (!booking) notFound();

  const active = booking.status === "confirmed" || booking.status === "pending_payment";
  const tooLate = !booking.beforeCancelCutoff;
  const message = error ? ERRORS[error] : !active ? ERRORS.not_active : tooLate ? ERRORS.too_late : null;

  return (
    <div className="space-y-4 rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-sand-200">
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">Cancel your booking?</h1>
      <div className="space-y-1">
        <p className="text-lg font-bold text-navy-700">{booking.title}</p>
        <SessionFacts startsAt={booking.startsAt} endsAt={booking.endsAt} location={booking.location} />
      </div>

      {message ? (
        <p role="alert" className="rounded-xl bg-sand-200 px-4 py-3 text-ink-700">
          {message}
        </p>
      ) : (
        <>
          <p className="text-ink-700">
            Your spot will go to someone else. You can cancel until {formatDay(booking.cancelDeadline)},{" "}
            {formatTime(booking.cancelDeadline)}.
            {booking.paymentStatus !== "unpaid" &&
              " If you've already paid, refunds are handled directly by the organiser, so reply to your confirmation email."}
          </p>
          <form action={cancelBookingAction}>
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="w-full rounded-full bg-navy-500 px-6 py-3.5 font-semibold text-cream-50 hover:bg-navy-700"
            >
              Yes, cancel my booking
            </button>
          </form>
        </>
      )}

      <Link
        href={`/b/${token}`}
        className="block py-2 text-center font-semibold text-navy-500 underline-offset-4 hover:underline"
      >
        {message ? "Back to my booking" : "No, keep my spot"}
      </Link>
    </div>
  );
}
