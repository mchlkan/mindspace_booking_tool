import type { Metadata } from "next";
import { SignupForm } from "@/components/auth-forms";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Become an organiser · Mindspace" };

export default function SignupPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-8 pb-16">
        <Card className="space-y-5">
          <div>
            <h1 className="font-brand text-2xl font-extrabold text-navy-700">Become an organiser</h1>
            <p className="mt-1 text-ink-500">Run classes or events with Mindspace. Tell us who you are.</p>
          </div>
          <SignupForm />
        </Card>
      </main>
    </>
  );
}
