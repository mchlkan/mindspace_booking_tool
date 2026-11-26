import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { SessionCard } from "@/components/session-card";
import { listUpcomingPublicSessions } from "@/lib/sessions";

export default function Home() {
  return (
    <>
      <header className="bg-navy-500 px-4 pt-6 pb-10 text-cream-50">
        <div className="mx-auto max-w-2xl">
          <Logo
            className="h-16 w-auto"
            textColor="var(--color-sun-300)"
            ringColor="var(--color-sun-300)"
          />
          <h1 className="mt-6 font-brand text-3xl leading-tight font-extrabold sm:text-4xl">
            Create space for yourself this week.
          </h1>
          <p className="mt-2 max-w-md text-lg text-cream-100/90">
            Yoga, pilates, meditation and club events. Book in under a minute, no account needed.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-2xl flex-1 px-4 pb-16">
        <Suspense fallback={<SessionsSkeleton />}>
          <UpcomingSessions />
        </Suspense>
      </main>

      <footer className="space-y-1 px-4 py-8 text-center text-sm text-stone-500">
        <p>@nova_mindspace</p>
        <p>
          <Link href="/login" className="underline underline-offset-4 hover:text-navy-500">
            Organiser sign in
          </Link>
        </p>
      </footer>
    </>
  );
}

async function UpcomingSessions() {
  const sessions = await listUpcomingPublicSessions();

  if (sessions.length === 0) {
    return (
      <p className="rounded-2xl bg-cream-50 p-6 text-center text-ink-500 ring-1 ring-sand-200">
        No sessions scheduled right now. Check back soon!
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((s, i) => (
        <SessionCard key={s.id} session={s} index={i} />
      ))}
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading sessions">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl bg-cream-50 ring-1 ring-sand-200" />
      ))}
    </div>
  );
}
