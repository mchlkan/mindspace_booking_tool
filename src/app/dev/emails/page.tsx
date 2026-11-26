import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { emailMode, listOutbox } from "@/lib/email/transport";
import { formatDay, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Email outbox (dev) · Mindspace", robots: { index: false } };

/** Local development only: emails the app would have sent, without Resend. */
export default function OutboxPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-16">
        <Suspense fallback={null}>
          <Outbox />
        </Suspense>
      </main>
    </>
  );
}

async function Outbox() {
  await connection();
  if (process.env.NODE_ENV === "production" || emailMode() !== "outbox") notFound();
  const emails = await listOutbox();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-brand text-2xl font-extrabold text-navy-700">Email outbox</h1>
        <p className="text-sm text-ink-500">
          Local preview: Resend isn&apos;t set up, so emails are saved here instead of being sent. Newest first.
        </p>
      </div>
      {emails.length === 0 ? (
        <p className="rounded-xl bg-cream-50 p-5 text-ink-500 ring-1 ring-sand-200">No emails yet. Book a session to see one.</p>
      ) : (
        <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl bg-cream-50 ring-1 ring-sand-200">
          {emails.map((e) => (
            <li key={e.id}>
              <Link href={`/dev/emails/${e.id}`} className="block px-5 py-3 hover:bg-cream-100">
                <span className="block font-semibold text-navy-700">{e.subject}</span>
                <span className="block text-sm text-ink-500">
                  To {e.to}
                  {e.attachments.length > 0 && " · 📎 calendar invite"}
                </span>
                <span className="mt-1 flex flex-wrap gap-2 text-xs">
                  {e.cancelledAt ? (
                    <Chip tone="muted">Cancelled</Chip>
                  ) : e.scheduledAt && new Date(e.scheduledAt) > new Date(e.createdAt) ? (
                    <Chip tone="sun">
                      Scheduled for {formatDay(new Date(e.scheduledAt))}, {formatTime(new Date(e.scheduledAt))}
                    </Chip>
                  ) : (
                    <Chip tone="navy">Sent {formatDay(new Date(e.createdAt))}, {formatTime(new Date(e.createdAt))}</Chip>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: "sun" | "navy" | "muted"; children: React.ReactNode }) {
  const tones = { sun: "bg-sun-300 text-navy-700", navy: "bg-navy-500 text-cream-50", muted: "bg-stone-300 text-ink-700" };
  return <span className={`rounded-full px-2.5 py-0.5 font-semibold ${tones[tone]}`}>{children}</span>;
}
