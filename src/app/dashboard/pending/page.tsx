import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function PendingPage() {
  return (
    <Suspense fallback={null}>
      <Pending />
    </Suspense>
  );
}

async function Pending() {
  await connection();
  const me = await requireOrganiser({ allowPending: true });
  if (me.status === "approved") redirect("/dashboard");
  return (
    <Card className="space-y-3">
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">Thanks, {me.name.split(/\s+/)[0]}!</h1>
      <p className="text-ink-700">
        Your organiser account is waiting for approval by a Mindspace admin. Once approved, you can create sessions here.
      </p>
      <p className="text-ink-700">
        Meanwhile, set up your <a href="/dashboard/profile" className="font-semibold text-navy-500 underline">profile</a>: your photo and payment link.
      </p>
    </Card>
  );
}
