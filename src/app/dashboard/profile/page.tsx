import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { Card } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">Your profile</h1>
      <Suspense fallback={<Card className="h-80 animate-pulse">{null}</Card>}>
        <Profile />
      </Suspense>
    </div>
  );
}

async function Profile() {
  await connection();
  const me = await requireOrganiser({ allowPending: true });
  return (
    <Card>
      <ProfileForm
        email={me.email}
        role={me.role}
        defaults={{ name: me.name, paymentLink: me.paymentLink ?? "", photoUrl: me.photoUrl }}
      />
    </Card>
  );
}
