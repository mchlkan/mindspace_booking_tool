"use client";

import { useActionState, useId, useState } from "react";
import { bookSessionAction, type BookingFormState } from "@/app/actions";
import { formatPrice } from "@/lib/format";

type Props = {
  sessionId: string;
  kind: "training" | "event";
  priceCents: number;
  acceptsCash: boolean;
  acceptsLink: boolean;
  matLimit: number;
  matsLeft: number;
  organiserName: string;
};

const inputClass =
  "mt-1.5 block w-full rounded-xl border-0 bg-white px-4 py-3 text-base text-ink-900 ring-1 ring-sand-400 " +
  "placeholder:text-stone-500 focus:ring-2 focus:ring-navy-500 focus:outline-none " +
  "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error";

export function BookingForm(props: Props) {
  const [state, action, pending] = useActionState<BookingFormState, FormData>(bookSessionAction, {});
  const id = useId();
  // Fields edited since the last submit: their old error is hidden. Tied to
  // `state`, so a new submit result starts with a clean slate.
  const [edited, setEdited] = useState<{ for: BookingFormState; names: Set<string> }>({
    for: state,
    names: new Set(),
  });
  const editedNames = edited.for === state ? edited.names : new Set<string>();
  const markEdited = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (!name || editedNames.has(name)) return;
    setEdited({ for: state, names: new Set(editedNames).add(name) });
  };
  const fe = Object.fromEntries(
    Object.entries(state.fieldErrors ?? {}).filter(([k]) => !editedNames.has(k)),
  ) as NonNullable<BookingFormState["fieldErrors"]>;
  const v = state.values;

  const paid = props.priceCents > 0;
  const methods = [
    props.acceptsCash && {
      value: "cash",
      title: "Cash on site",
      hint: "Pay at the session. Your spot is confirmed right away.",
    },
    props.acceptsLink && {
      value: "link",
      title: "Payment link",
      hint: `Pay ${props.organiserName} online, then tap "I've paid". We hold your spot for 24 h.`,
    },
  ].filter(Boolean) as { value: string; title: string; hint: string }[];
  const defaultMethod = v?.paymentMethod || (methods.length === 1 ? methods[0].value : "");
  const offersMats = props.kind === "training" && props.matLimit > 0;
  const noMatsLeft = props.matsLeft === 0;

  return (
    <form action={action} onChange={markEdited} className="space-y-5" noValidate>
      <input type="hidden" name="sessionId" value={props.sessionId} />

      {state.error && (
        <p role="alert" className="rounded-xl bg-sun-300 px-4 py-3 text-[15px] font-medium text-navy-700">
          {state.error}
        </p>
      )}

      <Field id={`${id}-name`} label="Full name" error={fe.fullName}>
        <input
          id={`${id}-name`}
          name="fullName"
          autoComplete="name"
          required
          defaultValue={v?.fullName}
          aria-invalid={!!fe.fullName}
          aria-describedby={fe.fullName ? `${id}-name-err` : undefined}
          className={inputClass}
        />
      </Field>

      <Field id={`${id}-email`} label="Email" hint="We'll send your confirmation here." error={fe.email}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={v?.email}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? `${id}-email-err` : `${id}-email-hint`}
          className={inputClass}
        />
      </Field>

      {offersMats && (
        <label
          className={`flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 ${noMatsLeft ? "opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            name="matRequested"
            disabled={noMatsLeft}
            defaultChecked={!noMatsLeft && v?.matRequested}
            className="mt-1 size-5 accent-navy-500"
          />
          <span>
            <span className="block font-semibold text-navy-700">I&apos;d like to borrow a mat</span>
            <span className="block text-sm text-ink-500">
              {noMatsLeft ? "No mats left. Please bring your own." : `${props.matsLeft} left`}
            </span>
          </span>
        </label>
      )}

      {paid && (
        <fieldset aria-describedby={fe.paymentMethod ? `${id}-pay-err` : undefined}>
          <legend className="font-semibold text-navy-700">
            How will you pay {formatPrice(props.priceCents)}?
          </legend>
          <div className="mt-2 space-y-2">
            {methods.map((m) => (
              <label
                key={m.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 has-checked:ring-2 has-checked:ring-navy-500"
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={m.value}
                  defaultChecked={defaultMethod === m.value}
                  className="mt-1 size-5 accent-navy-500"
                />
                <span>
                  <span className="block font-semibold text-navy-700">{m.title}</span>
                  <span className="block text-sm text-ink-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {fe.paymentMethod && <ErrorText id={`${id}-pay-err`}>{fe.paymentMethod}</ErrorText>}
        </fieldset>
      )}

      <div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="consent"
            required
            defaultChecked={v?.consent}
            aria-invalid={!!fe.consent}
            aria-describedby={fe.consent ? `${id}-consent-err` : undefined}
            className="mt-1 size-5 shrink-0 accent-navy-500"
          />
          <span className="text-sm text-ink-500">
            I agree that Mindspace stores my name and email to manage this booking. They&apos;re
            deleted 12 months after my last booking.
          </span>
        </label>
        {fe.consent && <ErrorText id={`${id}-consent-err`}>{fe.consent}</ErrorText>}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-sun-500 px-6 py-4 text-lg font-bold tracking-wide text-navy-700 uppercase shadow-sm transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Booking…" : "Book my spot"}
      </button>
    </form>
  );
}

function Field({
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

function ErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm font-medium text-error">
      {children}
    </p>
  );
}
