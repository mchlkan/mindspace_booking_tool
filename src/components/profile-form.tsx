"use client";

import { useActionState, useId } from "react";
import { updateProfileAction, type FormState } from "@/app/dashboard/actions";
import { ImageInput } from "@/components/image-input";
import { Alert, Field, inputClass, primaryButtonClass } from "@/components/ui";

const ROLE = { trainer: "Trainer", events_manager: "Events manager", admin: "Admin" } as const;

export function ProfileForm({
  email,
  role,
  defaults,
}: {
  email: string;
  role: keyof typeof ROLE;
  defaults: { name: string; paymentLink: string; photoUrl: string | null };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, {});
  const id = useId();
  const fe = state.fieldErrors ?? {};
  const v = { ...defaults, ...(state.values ?? {}) };

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.saved && <Alert tone="navy">Profile saved.</Alert>}
      <p className="text-sm text-ink-500">
        {email} · {ROLE[role]}
      </p>
      <Field id={`${id}-name`} label="Name" error={fe.name} hint="Shown to participants as the host.">
        <input id={`${id}-name`} name="name" defaultValue={String(v.name)} autoComplete="name" aria-invalid={!!fe.name} className={inputClass} />
      </Field>
      {role !== "events_manager" && (
        <Field
          id={`${id}-link`}
          label="Payment link"
          error={fe.paymentLink}
          hint="Your Revolut, PayPal.me or similar link. Shown to people who choose to pay by link."
        >
          <input
            id={`${id}-link`}
            name="paymentLink"
            type="url"
            inputMode="url"
            placeholder="https://revolut.me/yourname"
            defaultValue={String(v.paymentLink)}
            aria-invalid={!!fe.paymentLink}
            className={inputClass}
          />
        </Field>
      )}
      <div className="max-w-48">
        <ImageInput name="photo" label="Photo" currentUrl={defaults.photoUrl} error={fe.photo} removeName="removePhoto" aspect="aspect-square" />
      </div>
      <button type="submit" disabled={pending} className={`w-full ${primaryButtonClass}`}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
