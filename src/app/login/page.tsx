import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Organiser sign in · Mindspace" };

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-8 pb-16">
        <Card className="space-y-5">
          <div>
            <h1 className="font-brand text-2xl font-extrabold text-navy-700">Organiser sign in</h1>
            <p className="mt-1 text-ink-500">For Mindspace trainers, events managers and admins.</p>
          </div>
          <LoginForm />
        </Card>
      </main>
    </>
  );
}
