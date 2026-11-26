import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/app/auth-actions";
import { Logo } from "@/components/logo";
import { getCurrentOrganiser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard · Mindspace",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <>
      <header className="bg-navy-500 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/dashboard" aria-label="Dashboard home" className="-ml-1 rounded-lg p-1">
            <Logo className="h-9 w-auto" textColor="var(--color-sun-300)" ringColor="var(--color-sun-300)" />
          </Link>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16">{children}</main>
    </>
  );
}

async function Nav() {
  const me = await getCurrentOrganiser();
  if (!me) return null;
  const link = "rounded-full px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap text-cream-50 hover:bg-navy-700";
  return (
    <nav className="flex items-center gap-1" aria-label="Organiser">
      {me.status === "approved" && (
        <>
          <Link href="/dashboard" className={`hidden sm:inline-block ${link}`}>
            Sessions
          </Link>
          <Link href="/dashboard/sessions/new" className="rounded-full bg-sun-500 px-3 py-1.5 text-sm font-bold whitespace-nowrap text-navy-700 hover:brightness-95">
            + New
          </Link>
        </>
      )}
      <Link href="/dashboard/profile" className={link}>
        Profile
      </Link>
      <form action={signOutAction}>
        <button type="submit" className={link}>
          Sign out
        </button>
      </form>
    </nav>
  );
}
