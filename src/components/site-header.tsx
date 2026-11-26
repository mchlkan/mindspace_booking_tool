import Link from "next/link";
import { Logo } from "@/components/logo";

/** Compact navy header for inner pages; the logo links home. */
export function SiteHeader() {
  return (
    <header className="bg-navy-500 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center">
        <Link href="/" aria-label="Mindspace: all sessions" className="-ml-1 rounded-lg p-1">
          <Logo
            className="h-10 w-auto"
            textColor="var(--color-sun-300)"
            ringColor="var(--color-sun-300)"
          />
        </Link>
      </div>
    </header>
  );
}
