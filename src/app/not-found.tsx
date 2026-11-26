import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 text-center">
        <h1 className="font-brand text-3xl font-extrabold text-navy-700">We couldn&apos;t find that</h1>
        <p className="mt-3 text-ink-500">
          The link may be mistyped, or the session is no longer available.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-sun-500 px-6 py-3 font-bold tracking-wide text-navy-700 uppercase"
        >
          See all sessions
        </Link>
      </main>
    </>
  );
}
