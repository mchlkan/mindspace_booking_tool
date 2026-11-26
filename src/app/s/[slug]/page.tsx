import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailSkeleton, SessionDetailCard } from "@/components/session-detail";
import { SiteHeader } from "@/components/site-header";
import { getSessionBySlug } from "@/lib/sessions";

// Private sessions: reachable only with this link, never listed or indexed.
export const metadata: Metadata = {
  title: "Mindspace · Private session",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PrivateSessionPage({ params }: PageProps<"/s/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-16">
        <Suspense fallback={<DetailSkeleton />}>
          {params.then(({ slug }) => (
            <PrivateSession slug={slug} />
          ))}
        </Suspense>
      </main>
    </>
  );
}

async function PrivateSession({ slug }: { slug: string }) {
  const session = await getSessionBySlug(slug);
  if (!session) notFound();
  return <SessionDetailCard session={session} />;
}
