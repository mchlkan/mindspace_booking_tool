import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailSkeleton, SessionDetailCard } from "@/components/session-detail";
import { SiteHeader } from "@/components/site-header";
import { getPublicSession } from "@/lib/sessions";

export default function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-16">
        <Link href="/" className="inline-block py-2 text-sm font-medium text-navy-500 underline-offset-4 hover:underline">
          ← All sessions
        </Link>
        <Suspense fallback={<DetailSkeleton />}>
          {params.then(({ id }) => (
            <SessionDetailView id={id} />
          ))}
        </Suspense>
      </main>
    </>
  );
}

async function SessionDetailView({ id }: { id: string }) {
  const session = await getPublicSession(id);
  if (!session) notFound();
  return <SessionDetailCard session={session} />;
}
