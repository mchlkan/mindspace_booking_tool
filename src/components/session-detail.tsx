import { Users } from "lucide-react";
import { BookingForm } from "@/components/booking-form";
import { SessionBanner } from "@/components/session-banner";
import { SessionFacts } from "@/components/session-facts";
import { formatPrice } from "@/lib/format";
import type { SessionDetail } from "@/lib/sessions";

const iconProps = { strokeWidth: 1.25, "aria-hidden": true } as const;

/** Session page body, shared by /sessions/[id] and private links /s/[slug]. */
export function SessionDetailCard({ session }: { session: SessionDetail }) {
  const tint = session.kind === "training" ? "bg-navy-500 text-sun-300" : "bg-sun-300 text-navy-700";

  return (
    <article className="mt-2 overflow-hidden rounded-2xl bg-cream-50 shadow-sm ring-1 ring-sand-200">
      <SessionBanner
        kind={session.kind}
        bannerUrl={session.bannerUrl}
        fallbackTint={tint}
        heightClass={session.bannerUrl ? "h-52 sm:h-64" : "h-28"}
        eager
      />

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl leading-tight font-bold text-navy-700">{session.title}</h1>
          <span className="shrink-0 pt-1 text-xl font-semibold text-navy-700">
            {formatPrice(session.priceCents)}
          </span>
        </div>

        <SessionFacts
          startsAt={session.startsAt}
          endsAt={session.endsAt}
          location={session.location}
          host={session.organiserName}
        />

        {session.description && (
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-700">{session.description}</p>
        )}

        <hr className="border-sand-200" />

        <BookingSection session={session} />
      </div>
    </article>
  );
}

function BookingSection({ session }: { session: SessionDetail }) {
  if (session.status === "cancelled") {
    return <Notice>This session has been cancelled.</Notice>;
  }
  if (session.started) {
    return <Notice>This session has already started, so booking is closed.</Notice>;
  }
  if (session.visibility === "private" && session.kind === "event") {
    return (
      <Notice>
        This is a members-only event. Booking with member email verification opens soon. Ask the organiser if you
        have questions.
      </Notice>
    );
  }
  if (session.spotsLeft === 0) {
    return (
      <div className="space-y-2">
        <span className="inline-block rounded-full bg-stone-300 px-3 py-1 text-sm font-semibold text-ink-700">Full</span>
        <p className="text-ink-500">All spots are taken. Keep an eye out: spots open up when people cancel.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="book-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="book-heading" className="text-lg font-bold text-navy-700">
          Book your spot
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-300 px-3 py-1 text-sm font-semibold text-navy-700">
          <Users className="size-4" {...iconProps} />
          {session.spotsLeft} {session.spotsLeft === 1 ? "spot" : "spots"} left
        </span>
      </div>
      <BookingForm
        sessionId={session.id}
        privateSlug={session.visibility === "private" ? (session.privateSlug ?? undefined) : undefined}
        kind={session.kind}
        priceCents={session.priceCents}
        acceptsCash={session.acceptsCash}
        acceptsLink={session.acceptsLink}
        matLimit={session.matLimit}
        matsLeft={session.matsLeft}
        organiserName={session.organiserName}
      />
    </section>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-sand-200 px-4 py-3 text-ink-700">{children}</p>;
}

export function DetailSkeleton() {
  return <div className="mt-2 h-[32rem] animate-pulse rounded-2xl bg-cream-50 ring-1 ring-sand-200" aria-busy="true" />;
}
