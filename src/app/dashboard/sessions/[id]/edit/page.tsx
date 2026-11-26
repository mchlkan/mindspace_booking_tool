import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { updateSessionAction } from "@/app/dashboard/actions";
import { SessionForm } from "@/components/session-form";
import { Alert, Card } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { getManagedSession } from "@/lib/organiser";
import { lisbonToday, utcToLisbon } from "@/lib/time";

export default function EditSessionPage({ params }: PageProps<"/dashboard/sessions/[id]/edit">) {
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse">{null}</Card>}>
      {params.then(({ id }) => (
        <EditSession id={id} />
      ))}
    </Suspense>
  );
}

async function EditSession({ id }: { id: string }) {
  await connection();
  const me = await requireOrganiser();
  const s = await getManagedSession(me, id);
  if (!s) notFound();
  const start = utcToLisbon(s.startsAt);
  const end = utcToLisbon(s.endsAt);
  const editable = s.status === "published" && s.upcoming;

  return (
    <div className="space-y-4">
      <Link href={`/dashboard/sessions/${id}`} className="inline-block text-sm font-medium text-navy-500 hover:underline">
        ← Back to session
      </Link>
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">Edit {s.title}</h1>
      {s.seriesId && <Alert tone="sand">This is one week of a weekly series. Changes apply to this date only.</Alert>}
      {!editable ? (
        <Alert tone="sand">This session can&apos;t be edited any more (it has started or was cancelled).</Alert>
      ) : (
        <Card>
          <SessionForm
            mode="edit"
            action={updateSessionAction}
            kinds={[s.kind]}
            hasPaymentLink={!!s.organiserPaymentLink}
            minDate={lisbonToday()}
            defaults={{
              id: s.id,
              kind: s.kind,
              title: s.title,
              description: s.description,
              location: s.location,
              date: start.date,
              startTime: start.time,
              endTime: end.time,
              spotLimit: String(s.spotLimit),
              matLimit: String(s.matLimit),
              price: s.priceCents ? (s.priceCents / 100).toFixed(s.priceCents % 100 ? 2 : 0) : "",
              acceptsCash: s.acceptsCash,
              acceptsLink: s.acceptsLink,
              visibility: s.visibility,
              cancelCutoffHours: String(s.cancelCutoffHours),
              bannerUrl: s.bannerUrl,
            }}
          />
        </Card>
      )}
    </div>
  );
}
