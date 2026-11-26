"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy-500 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-navy-700"
    >
      {copied ? <Check className="size-4" strokeWidth={1.5} aria-hidden /> : <Copy className="size-4" strokeWidth={1.5} aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}
