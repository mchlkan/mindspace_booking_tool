import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { verifyLoginAction } from "@/app/auth-actions";
import { SiteHeader } from "@/components/site-header";
import { Alert, Card, primaryButtonClass } from "@/components/ui";
import { peekLoginToken } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in · Mindspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The emailed link only opens this page; signing in needs a button press.
 * Email security scanners open links automatically and would otherwise use
 * up the one-time link before the person does.
 */
export default function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-8 pb-16">
        <Suspense fallback={<Card className="h-48 animate-pulse">{null}</Card>}>
          {searchParams.then((sp) => (
            <Verify
              token={typeof sp.token === "string" ? sp.token : ""}
              error={typeof sp.error === "string"}
            />
          ))}
        </Suspense>
      </main>
    </>
  );
}

async function Verify({ token, error }: { token: string; error: boolean }) {
  await connection();
  const who = error ? null : await peekLoginToken(token);

  if (!who) {
    return (
      <Card className="space-y-4">
        <h1 className="font-brand text-2xl font-extrabold text-navy-700">This link has expired</h1>
        <p className="text-ink-700">Sign-in links work once and expire after 15 minutes. Request a fresh one below.</p>
        <Link href="/login" className={`w-full ${primaryButtonClass}`}>
          Get a new link
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <h1 className="font-brand text-2xl font-extrabold text-navy-700">Welcome back, {who.name.split(/\s+/)[0]}</h1>
      <Alert tone="sand">Signing in as {who.email}</Alert>
      <form action={verifyLoginAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={`w-full ${primaryButtonClass}`}>
          Sign in
        </button>
      </form>
    </Card>
  );
}
