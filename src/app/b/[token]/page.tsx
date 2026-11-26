import { CircleCheck, Clock3, ExternalLink, Hourglass, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { reportPaidAction } from "@/app/actions";
import { SessionFacts } from "@/components/session-facts";
import { SiteHeader } from "@/components/site-header";
import { getBookingByToken, type BookingView } from "@/lib/booking";
import { formatDay, formatPrice, formatTime } from "@/lib/format";

// The URL contains a secret token: keep it out of search engines and referrers.
export const metadata: Metadata = {
  title: "Your booking · Mindspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function BookingPage({ params }: PageProps<"/b/[token]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-16">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-cream-50 ring-1 ring-sand-200" />}>
          {params.then(({ token }) => (
            <BookingDetails token={token} />
          ))}
        </Suspense>
      </main>
    </>
  );
}

const iconProps = { strokeWidth: 1.25, "aria-hidden": true } as const;

async function BookingDetails({ token }: { token: string }) {
  await connection();
  const booking = await getBookingByToken(token);
  if (!booking) notFound();

  return (
    <div className="space-y-4">
      <StatusBanner booking={booking} />

      <article className="space-y-4 rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-sand-200">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl leading-tight font-bold text-navy-700">{booking.title}</h2>
          <span className="shrink-0 text-lg font-semibold text-navy-700">{formatPrice(booking.priceCents)}</span>
        </div>
        <SessionFacts
          startsAt={booking.startsAt}
          endsAt={booking.endsAt}
          location={booking.location}
          host={booking.organiserName}
        />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-sand-200 pt-4 text-[15px]">
          <dt className="text-ink-500">Name</dt>
          <dd className="text-ink-900">{booking.fullName}</dd>
          <dt className="text-ink-500">Email</dt>
          <dd className="break-all text-ink-900">{booking.email}</dd>
          {booking.kind === "training" && (
            <>
              <dt className="text-ink-500">Mat</dt>
              <dd className="text-ink-900">{booking.matRequested ? "Reserved for you" : "Bringing my own"}</dd>
            </>
          )}
          {booking.paymentMethod && (
            <>
              <dt className="text-ink-500">Payment</dt>
              <dd className="text-ink-900">
                {booking.paymentMethod === "cash" ? "Cash on site" : "Payment link"}
                {" · "}
                {paymentLabel(booking)}
              </dd>
            </>
          )}
        </dl>
      </article>

      {booking.status === "pending_payment" && <PayNow booking={booking} token={token} />}

      <p className="px-1 text-sm text-ink-500">
        Bookmark this page to come back to your booking. A confirmation email with a calendar invite and
        a cancel link is coming soon.
      </p>
      <Link href="/" className="inline-block px-1 py-2 text-sm font-medium text-navy-500 underline-offset-4 hover:underline">
        ← Browse more sessions
      </Link>
    </div>
  );
}

function StatusBanner({ booking }: { booking: BookingView }) {
  if (booking.sessionStatus === "cancelled") {
    return (
      <Banner tone="muted" icon={<XCircle className="size-8 shrink-0" {...iconProps} />} title="This session was cancelled">
        Sorry about that! The organiser cancelled this session.
      </Banner>
    );
  }
  switch (booking.status) {
    case "confirmed":
      return (
        <Banner tone="success" icon={<CircleCheck className="size-8 shrink-0" {...iconProps} />} title="You're booked!">
          See you on {formatDay(booking.startsAt)} at {formatTime(booking.startsAt)}. Enjoy creating some space for
          yourself.
        </Banner>
      );
    case "pending_payment":
      return (
        <Banner tone="pending" icon={<Hourglass className="size-8 shrink-0" {...iconProps} />} title="Almost there: please pay">
          Your spot is held until {formatDay(booking.holdExpiresAt!)}, {formatTime(booking.holdExpiresAt!)}. Pay with the
          link below, then tap &ldquo;I&apos;ve paid&rdquo;.
        </Banner>
      );
    case "expired":
      return (
        <Banner tone="muted" icon={<Clock3 className="size-8 shrink-0" {...iconProps} />} title="Your hold ran out">
          We didn&apos;t get a payment in time, so the spot was released. If there&apos;s still room, you can book again.
        </Banner>
      );
    case "cancelled":
      return (
        <Banner tone="muted" icon={<XCircle className="size-8 shrink-0" {...iconProps} />} title="Booking cancelled">
          This booking was cancelled.
        </Banner>
      );
  }
}

function PayNow({ booking, token }: { booking: BookingView; token: string }) {
  return (
    <section className="space-y-3 rounded-2xl bg-cream-50 p-5 ring-1 ring-sand-200">
      <h2 className="font-bold text-navy-700">Pay {formatPrice(booking.priceCents)} to {booking.organiserName}</h2>
      {booking.paymentLink && (
        <a
          href={booking.paymentLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-navy-500 px-6 py-3.5 font-semibold text-cream-50 hover:bg-navy-700"
        >
          Open payment link
          <ExternalLink className="size-4" {...iconProps} />
        </a>
      )}
      <form action={reportPaidAction}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="w-full rounded-full bg-sun-500 px-6 py-3.5 font-bold tracking-wide text-navy-700 uppercase hover:brightness-95"
        >
          I&apos;ve paid
        </button>
      </form>
      <p className="text-sm text-ink-500">
        No money goes through this app. {booking.organiserName} checks payments and can update the status.
      </p>
    </section>
  );
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "success" | "pending" | "muted";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    success: "bg-navy-500 text-cream-50",
    pending: "bg-sun-300 text-navy-700",
    muted: "bg-sand-200 text-ink-900",
  } as const;
  return (
    <div role="status" className={`flex gap-4 rounded-2xl p-5 ${tones[tone]}`}>
      {icon}
      <div>
        <h1 className="font-brand text-2xl leading-tight font-extrabold">{title}</h1>
        <p className="mt-1 text-[15px] opacity-90">{children}</p>
      </div>
    </div>
  );
}

function paymentLabel(b: BookingView) {
  if (b.paymentStatus === "paid") return "Paid";
  if (b.paymentStatus === "reported_paid") return "You marked it as paid";
  return b.paymentMethod === "cash" ? "Pay on site" : "Not paid yet";
}
