import { Lock, Pencil, Repeat, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { setPaymentStatusAction } from "@/app/dashboard/actions";
import { CopyButton } from "@/components/copy-button";
import { SessionFacts } from "@/components/session-facts";
import { Alert, Card, ghostButtonClass } from "@/components/ui";
import { appUrl } from "@/lib/app-url";
import { requireOrganiser } from "@/lib/auth";
import { formatDay, formatPrice, formatTime } from "@/lib/format";
import { getManagedSession, type ManagedSession } from "@/lib/organiser";

export default function ManageSessionPage({ params, searchParams }: PageProps<"/dashboard/sessions/[id]">) {
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse">{null}</Card>}>
      {Promise.all([params, searchParams]).then(([{ id }, sp]) => (
        <ManageSession id={id} flash={flashFrom(sp)} />
      ))}
    </Suspense>
  );
}

function flashFrom(sp: Record<string, string | string[] | undefined>) {
  if (typeof sp.created === "string") {
    const n = Number(sp.created);
    return n > 1 ? `Created ${n} weekly sessions. This is the first one.` : "Session created. It's live now.";
  }
  if (sp.saved) return "Changes saved. If the time or place changed, everyone booked is being emailed.";
  if (typeof sp.cancelled === "string") {
    const n = Number(sp.cancelled);
    return n > 1 ? `Cancelled ${n} sessions. Participants are being emailed.` : "Session cancelled. Participants are being emailed.";
  }
  return null;
}

const icon = { strokeWidth: 1.25, "aria-hidden": true } as const;

async function ManageSession({ id, flash }: { id: string; flash: string | null }) {
  await connection();
  const me = await requireOrganiser();
  const s = await getManagedSession(me, id);
  if (!s) notFound();

  const upcoming = s.upcoming;
  const live = s.status === "published";
  const privateUrl = s.privateSlug ? appUrl(`/s/${s.privateSlug}`) : null;

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="inline-block text-sm font-medium text-navy-500 hover:underline">
        ← Sessions
      </Link>
      {flash && <Alert tone="navy">{flash}</Alert>}

      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={`text-2xl leading-tight font-bold text-navy-700 ${live ? "" : "line-through"}`}>{s.title}</h1>
            <p className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-sand-200 px-2.5 py-1">{s.kind === "training" ? "Class" : "Event"}</span>
              {!live && <span className="rounded-full bg-stone-300 px-2.5 py-1">Cancelled</span>}
              {s.visibility === "private" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sand-200 px-2.5 py-1">
                  <Lock className="size-3.5" {...icon} /> Private
                </span>
              )}
              {s.seriesId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sand-200 px-2.5 py-1">
                  <Repeat className="size-3.5" {...icon} /> Weekly
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 text-xl font-semibold text-navy-700">{formatPrice(s.priceCents)}</span>
        </div>
        <SessionFacts startsAt={s.startsAt} endsAt={s.endsAt} location={s.location} host={me.role === "admin" ? s.organiserName : undefined} />

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Booked" value={`${s.spotsTaken}/${s.spotLimit}`} />
          {s.kind === "training" && s.matLimit > 0 ? <Stat label="Mats" value={`${s.matsTaken}/${s.matLimit}`} /> : <Stat label="Mats" value="–" />}
          <Stat label="Unpaid" value={s.priceCents ? String(s.unpaid) : "–"} />
        </dl>

        {privateUrl && live && (
          <div className="rounded-xl bg-sun-300 p-3">
            <p className="text-sm font-semibold text-navy-700">
              Private link: {s.kind === "training" ? "anyone with it can book" : "members only"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white/70 px-2 py-1.5 text-xs">{privateUrl}</code>
              <CopyButton text={privateUrl} />
            </div>
          </div>
        )}

        {live && upcoming && (
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/dashboard/sessions/${s.id}/edit`} className={ghostButtonClass}>
              <Pencil className="size-4" {...icon} /> Edit
            </Link>
            <Link href={`/dashboard/sessions/${s.id}/cancel`} className={ghostButtonClass}>
              <XCircle className="size-4" {...icon} /> Cancel
            </Link>
          </div>
        )}
      </Card>

      <Participants s={s} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream-100 py-2">
      <dt className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className="text-lg font-bold text-navy-700">{value}</dd>
    </div>
  );
}

function Participants({ s }: { s: ManagedSession }) {
  const active = s.bookings.filter((b) => b.holding);
  const inactive = s.bookings.filter((b) => !b.holding);
  return (
    <Card className="space-y-3" >
      <h2 id="participants" className="text-lg font-bold text-navy-700">
        Participants ({active.length})
      </h2>
      {active.length === 0 ? (
        <p className="text-ink-500">No bookings yet.</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {active.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{b.fullName}</p>
                <p className="truncate text-sm text-ink-500">{b.email}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
                  {b.matRequested && <span className="rounded-full bg-sand-200 px-2 py-0.5">Mat</span>}
                  {b.paymentMethod && (
                    <span className="rounded-full bg-sand-200 px-2 py-0.5">{b.paymentMethod === "cash" ? "Cash" : "Link"}</span>
                  )}
                  {b.status === "pending_payment" && b.holdExpiresAt && (
                    <span className="rounded-full bg-sun-300 px-2 py-0.5 text-navy-700">
                      Held until {formatDay(b.holdExpiresAt)} {formatTime(b.holdExpiresAt)}
                    </span>
                  )}
                </p>
              </div>
              {s.priceCents > 0 && <PaymentToggle s={s} b={b} />}
            </li>
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-navy-500">
            Cancelled or expired ({inactive.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-500">
            {inactive.map((b) => (
              <li key={b.id}>
                {b.fullName} · {b.status === "cancelled" ? "cancelled" : "hold expired"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function PaymentToggle({ s, b }: { s: ManagedSession; b: ManagedSession["bookings"][number] }) {
  const paid = b.paymentStatus === "paid";
  const label = paid ? "Paid" : b.paymentStatus === "reported_paid" ? "Says paid" : "Unpaid";
  const tone = paid ? "bg-navy-500 text-cream-50" : b.paymentStatus === "reported_paid" ? "bg-sun-300 text-navy-700" : "bg-sand-200 text-ink-900";
  return (
    <form action={setPaymentStatusAction} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={b.id} />
      <input type="hidden" name="sessionId" value={s.id} />
      <input type="hidden" name="to" value={paid ? "unpaid" : "paid"} />
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>
      <button type="submit" className="text-sm font-semibold text-navy-500 underline underline-offset-4">
        {paid ? "Mark unpaid" : "Mark paid"}
      </button>
    </form>
  );
}
