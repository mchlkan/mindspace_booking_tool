import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cancelSessionAction } from "@/app/dashboard/actions";
import { Alert, Card, ghostButtonClass } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { formatDay, formatTime } from "@/lib/format";
import { getManagedSession } from "@/lib/organiser";

export default function CancelSessionPage({ params, searchParams }: PageProps<"/dashboard/sessions/[id]/cancel">) {
  return (
    <Suspense fallback={<Card className="h-64 animate-pulse">{null}</Card>}>
      {Promise.all([params, searchParams]).then(([{ id }, sp]) => (
        <CancelSession id={id} error={typeof sp.error === "string" ? sp.error : undefined} />
      ))}
    </Suspense>
  );
}

async function CancelSession({ id, error }: { id: string; error?: string }) {
  await connection();
  const me = await requireOrganiser();
  const s = await getManagedSession(me, id);
  if (!s) notFound();

  return (
    <Card className="space-y-4">
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">Cancel {s.title}?</h1>
      <p className="text-ink-700">
        {formatDay(s.startsAt)}, {formatTime(s.startsAt)} · {s.location}
      </p>
      {error && <Alert>{error}</Alert>}
      <p className="text-ink-700">
        {s.spotsTaken > 0
          ? `${s.spotsTaken} ${s.spotsTaken === 1 ? "person is" : "people are"} booked. They'll get an email that it's cancelled, with a calendar update. If anyone already paid, refunds are up to you, outside the app.`
          : "Nobody is booked yet."}
      </p>
      <form action={cancelSessionAction} className="space-y-3">
        <input type="hidden" name="id" value={s.id} />
        {s.seriesId && (
          <fieldset className="space-y-2">
            <legend className="font-semibold text-navy-700">This is a weekly session</legend>
            {[
              { v: "one", t: "Only this date" },
              { v: "following", t: "This and all later weeks" },
            ].map((o) => (
              <label key={o.v} className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 has-checked:ring-2 has-checked:ring-navy-500">
                <input type="radio" name="scope" value={o.v} defaultChecked={o.v === "one"} className="size-5 accent-navy-500" />
                <span className="font-semibold text-navy-700">{o.t}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" className="w-full rounded-full bg-error px-6 py-3.5 font-semibold text-white hover:brightness-110">
          Yes, cancel and notify participants
        </button>
      </form>
      <Link href={`/dashboard/sessions/${id}`} className={`w-full ${ghostButtonClass}`}>
        Keep the session
      </Link>
    </Card>
  );
}
