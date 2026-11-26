/** Shared form and layout pieces, styled with the brand tokens. */

export const inputClass =
  "mt-1.5 block w-full rounded-xl border-0 bg-white px-4 py-3 text-base text-ink-900 ring-1 ring-sand-400 " +
  "placeholder:text-stone-500 focus:ring-2 focus:ring-navy-500 focus:outline-none " +
  "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error disabled:bg-cream-100 disabled:text-ink-500";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-sun-500 px-6 py-3.5 font-bold tracking-wide text-navy-700 uppercase " +
  "shadow-sm transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 " +
  "focus-visible:outline-none disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-navy-500 px-5 py-3 font-semibold text-cream-50 " +
  "hover:bg-navy-700 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60";

export const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-navy-700 ring-1 ring-sand-400 " +
  "hover:bg-cream-100 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none disabled:opacity-60";

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="font-semibold text-navy-700">
        {label}
      </label>
      {children}
      {error ? (
        <ErrorText id={`${id}-err`}>{error}</ErrorText>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-sm text-ink-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function ErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm font-medium text-error">
      {children}
    </p>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-sand-200 ${className}`}>{children}</div>;
}

export function Alert({ tone = "sun", children }: { tone?: "sun" | "sand" | "navy"; children: React.ReactNode }) {
  const tones = { sun: "bg-sun-300 text-navy-700", sand: "bg-sand-200 text-ink-900", navy: "bg-navy-500 text-cream-50" };
  return (
    <p role="alert" className={`rounded-xl px-4 py-3 text-[15px] font-medium ${tones[tone]}`}>
      {children}
    </p>
  );
}
