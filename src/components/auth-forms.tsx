"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { requestLoginAction, signupAction, type AuthFormState } from "@/app/auth-actions";
import { Alert, Field, inputClass, primaryButtonClass } from "@/components/ui";

function CheckEmail({ email }: { email?: string }) {
  return (
    <div className="space-y-3">
      <Alert tone="navy">Check your inbox</Alert>
      <p className="text-ink-700">
        If <strong>{email}</strong> belongs to a Mindspace organiser, we&apos;ve sent a sign-in link. It works once and
        expires in 15 minutes.
      </p>
      <p className="text-sm text-ink-500">Nothing there? Check your spam folder, or try again in a minute.</p>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestLoginAction, {});
  const id = useId();
  if (state.sent) return <CheckEmail email={state.email} />;

  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id={`${id}-email`} label="Email" error={state.fieldErrors?.email} hint="We'll email you a sign-in link. No password needed.">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.values?.email}
          aria-invalid={!!state.fieldErrors?.email}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={`w-full ${primaryButtonClass}`}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-center text-sm text-ink-500">
        New trainer or events manager?{" "}
        <Link href="/signup" className="font-semibold text-navy-500 underline underline-offset-4">
          Request an account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signupAction, {});
  const id = useId();
  const fe = state.fieldErrors ?? {};
  if (state.sent) return <CheckEmail email={state.email} />;

  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id={`${id}-name`} label="Full name" error={fe.name}>
        <input
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          required
          defaultValue={state.values?.name}
          aria-invalid={!!fe.name}
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-email`} label="Email" error={fe.email}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.values?.email}
          aria-invalid={!!fe.email}
          className={inputClass}
        />
      </Field>
      <fieldset>
        <legend className="font-semibold text-navy-700">I&apos;d like to organise</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            { value: "trainer", title: "Classes", hint: "Yoga, pilates, meditation…" },
            { value: "events_manager", title: "Club events", hint: "Workshops, socials, retreats…" },
          ].map((r) => (
            <label
              key={r.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 has-checked:ring-2 has-checked:ring-navy-500"
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                defaultChecked={state.values?.role === r.value}
                className="mt-1 size-5 accent-navy-500"
              />
              <span>
                <span className="block font-semibold text-navy-700">{r.title}</span>
                <span className="block text-sm text-ink-500">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {fe.role && <p className="mt-1 text-sm font-medium text-error">{fe.role}</p>}
      </fieldset>
      <p className="text-sm text-ink-500">An admin approves new organisers before they can publish sessions.</p>
      <button type="submit" disabled={pending} className={`w-full ${primaryButtonClass}`}>
        {pending ? "Sending…" : "Request account"}
      </button>
      <p className="text-center text-sm text-ink-500">
        Already an organiser?{" "}
        <Link href="/login" className="font-semibold text-navy-500 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
