import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { createSessionAction } from "@/app/dashboard/actions";
import { SessionForm } from "@/components/session-form";
import { Card } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { allowedKinds } from "@/lib/organiser";
import { lisbonToday } from "@/lib/time";

export default function NewSessionPage() {
  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="inline-block text-sm font-medium text-navy-500 hover:underline">
        ← Sessions
      </Link>
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">New session</h1>
      <Suspense fallback={<Card className="h-96 animate-pulse">{null}</Card>}>
        <NewSession />
      </Suspense>
    </div>
  );
}

async function NewSession() {
  await connection();
  const me = await requireOrganiser();
  const kinds = allowedKinds(me);
  const today = lisbonToday();
  return (
    <Card>
      <SessionForm
        mode="create"
        action={createSessionAction}
        kinds={kinds}
        hasPaymentLink={!!me.paymentLink}
        minDate={today}
        defaults={{
          kind: kinds[0],
          title: "",
          description: "",
          location: "",
          date: "",
          startTime: "18:00",
          endTime: "19:00",
          spotLimit: "12",
          matLimit: kinds[0] === "training" ? "6" : "0",
          price: "",
          acceptsCash: true,
          acceptsLink: !!me.paymentLink && kinds[0] === "training",
          visibility: "public",
          cancelCutoffHours: "24",
          bannerUrl: null,
        }}
      />
    </Card>
  );
}
