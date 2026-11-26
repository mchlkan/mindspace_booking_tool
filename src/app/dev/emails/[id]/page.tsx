import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { emailMode, readOutboxEmail } from "@/lib/email/transport";

export default function OutboxEmailPage({ params }: PageProps<"/dev/emails/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-16">
        <Link href="/dev/emails" className="inline-block py-2 text-sm font-medium text-navy-500 hover:underline">
          ← Outbox
        </Link>
        <Suspense fallback={null}>
          {params.then(({ id }) => (
            <EmailView id={id} />
          ))}
        </Suspense>
      </main>
    </>
  );
}

async function EmailView({ id }: { id: string }) {
  await connection();
  if (process.env.NODE_ENV === "production" || emailMode() !== "outbox") notFound();
  const email = await readOutboxEmail(id);
  if (!email) notFound();

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-cream-50 p-5 text-sm ring-1 ring-sand-200">
        <dt className="text-ink-500">Subject</dt>
        <dd className="font-semibold text-navy-700">{email.subject}</dd>
        <dt className="text-ink-500">From</dt>
        <dd>{email.from}</dd>
        <dt className="text-ink-500">Reply-To</dt>
        <dd>{email.replyTo}</dd>
        <dt className="text-ink-500">To</dt>
        <dd>{email.to}</dd>
        {email.scheduledAt && (
          <>
            <dt className="text-ink-500">Scheduled</dt>
            <dd>
              {new Date(email.scheduledAt).toLocaleString("en-GB", { timeZone: "Europe/Lisbon" })}
              {email.cancelledAt && " (cancelled)"}
            </dd>
          </>
        )}
        {email.attachments.map((a) => (
          <div key={a.filename} className="contents">
            <dt className="text-ink-500">Attachment</dt>
            <dd>
              <a
                download={a.filename}
                href={`data:${a.contentType.split(";")[0]};charset=utf-8,${encodeURIComponent(a.content)}`}
                className="font-semibold text-navy-500 underline"
              >
                {a.filename}
              </a>
            </dd>
          </div>
        ))}
      </dl>
      <iframe
        title="Email preview"
        srcDoc={email.html}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="h-[900px] w-full rounded-2xl bg-white ring-1 ring-sand-200"
      />
    </div>
  );
}
