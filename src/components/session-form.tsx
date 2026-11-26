"use client";

import { useActionState, useId, useState } from "react";
import type { FormState } from "@/app/dashboard/actions";
import { ImageInput } from "@/components/image-input";
import { Alert, Field, inputClass, primaryButtonClass } from "@/components/ui";

export type SessionFormDefaults = {
  id?: string;
  kind: "training" | "event";
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  spotLimit: string;
  matLimit: string;
  price: string;
  acceptsCash: boolean;
  acceptsLink: boolean;
  visibility: "public" | "private";
  cancelCutoffHours: string;
  bannerUrl: string | null;
};

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: SessionFormDefaults;
  /** Kinds this organiser may pick (admins: both). Fixed when editing. */
  kinds: ("training" | "event")[];
  /** The session owner has a payment link set up. */
  hasPaymentLink: boolean;
  minDate: string;
};

export function SessionForm({ mode, action, defaults, kinds, hasPaymentLink, minDate }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const id = useId();
  const v = { ...defaults, ...(state.values ?? {}) } as SessionFormDefaults & Record<string, string | boolean>;
  const fe = state.fieldErrors ?? {};
  const [kind, setKind] = useState<"training" | "event">(v.kind);
  const [price, setPrice] = useState(String(v.price ?? ""));
  const [repeat, setRepeat] = useState(v.repeatWeekly === true);
  const isFree = price.trim() === "" || Number(price.replace(",", ".")) === 0;
  const isTraining = kind === "training";

  const text = (name: keyof SessionFormDefaults, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field id={`${id}-${name}`} label={label} error={fe[name]} hint={hint}>
      <input
        id={`${id}-${name}`}
        name={name}
        defaultValue={String(v[name] ?? "")}
        aria-invalid={!!fe[name]}
        className={inputClass}
        {...props}
      />
    </Field>
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {state.error && <Alert>{state.error}</Alert>}
      {Object.keys(fe).length > 0 && !state.error && <Alert>Please check the highlighted fields.</Alert>}

      {kinds.length > 1 && mode === "create" ? (
        <fieldset>
          <legend className="font-semibold text-navy-700">Type</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["training", "event"] as const).map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 has-checked:ring-2 has-checked:ring-navy-500"
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="size-5 accent-navy-500"
                />
                <span className="font-semibold text-navy-700">{k === "training" ? "Class" : "Event"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="kind" value={kind} />
      )}

      <section className="space-y-4">
        {text("title", "Title", { required: true, maxLength: 80, placeholder: isTraining ? "Sunrise Yoga" : "Beach Sunset Circle" })}
        <Field id={`${id}-description`} label="Description" error={fe.description} hint="What to expect, what to bring, who it's for.">
          <textarea
            id={`${id}-description`}
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={String(v.description ?? "")}
            className={inputClass}
          />
        </Field>
        {text("location", "Location", { required: true, placeholder: "Nova SBE, Rooftop terrace" })}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-navy-700">When</h2>
        {text("date", mode === "create" && repeat ? "First date" : "Date", { type: "date", required: true, min: minDate })}
        <div className="grid grid-cols-2 gap-3">
          {text("startTime", "Starts", { type: "time", required: true, step: 300 })}
          {text("endTime", "Ends", { type: "time", required: true, step: 300 })}
        </div>
        <p className="-mt-2 text-sm text-ink-500">Lisbon time.</p>
        {mode === "create" && (
          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="repeatWeekly"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
                className="size-5 accent-navy-500"
              />
              <span className="font-semibold text-navy-700">Repeat every week</span>
            </label>
            {repeat && (
              <div className="mt-3">
                {text("repeatUntil" as keyof SessionFormDefaults, "Until (last date)", { type: "date", min: minDate }, "Up to 26 weeks. Each week becomes its own session you can edit or cancel.")}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-navy-700">Spots &amp; price</h2>
        <div className="grid grid-cols-2 gap-3">
          {text("spotLimit", "Spots", { type: "number", inputMode: "numeric", min: 1, max: 500, required: true })}
          {isTraining ? (
            text("matLimit", "Mats to lend", { type: "number", inputMode: "numeric", min: 0, max: 500 })
          ) : (
            <input type="hidden" name="matLimit" value="0" />
          )}
        </div>
        <Field id={`${id}-price`} label="Price (€)" error={fe.price} hint="Leave empty or 0 for free.">
          <input
            id={`${id}-price`}
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            aria-invalid={!!fe.price}
            className={inputClass}
          />
        </Field>
        {!isFree && (
          <fieldset>
            <legend className="font-semibold text-navy-700">How people can pay</legend>
            <div className="mt-2 space-y-2">
              <Check name="acceptsCash" defaultChecked={v.acceptsCash} title="Cash on site" hint="Confirmed straight away; you mark it paid at the session." />
              {isTraining && (
                <Check
                  name="acceptsLink"
                  defaultChecked={v.acceptsLink && hasPaymentLink}
                  disabled={!hasPaymentLink}
                  title="Payment link"
                  hint={hasPaymentLink ? "People pay via your link; the spot is held 24 h until they tap \"I've paid\"." : "Add your payment link in your profile to offer this."}
                />
              )}
            </div>
            {(fe.acceptsCash || fe.acceptsLink) && (
              <p className="mt-1 text-sm font-medium text-error">{fe.acceptsCash ?? fe.acceptsLink}</p>
            )}
          </fieldset>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-navy-700">Who can book</h2>
        <div className="space-y-2">
          <Radio name="visibility" value="public" defaultChecked={v.visibility === "public"} title="Public" hint="Listed on the Mindspace page for everyone." />
          <Radio
            name="visibility"
            value="private"
            defaultChecked={v.visibility === "private"}
            title="Private link"
            hint={isTraining ? "Not listed. Anyone with the link can book." : "Not listed. Only club members can book, after verifying their email."}
          />
        </div>
        {text("cancelCutoffHours", "Participants can cancel until … hours before", { type: "number", inputMode: "numeric", min: 0, max: 168 })}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-navy-700">Banner photo</h2>
        <ImageInput
          name="banner"
          label="Photo"
          currentUrl={defaults.bannerUrl}
          error={fe.banner}
          removeName={mode === "edit" ? "removeBanner" : undefined}
          hint="Landscape works best. Real photos of the club are perfect."
        />
      </section>

      <button type="submit" disabled={pending} className={`w-full ${primaryButtonClass}`}>
        {pending ? "Saving…" : mode === "create" ? (repeat ? "Create weekly sessions" : "Create session") : "Save changes"}
      </button>
      {mode === "edit" && (
        <p className="text-center text-sm text-ink-500">If you change the time or place, everyone booked gets an email.</p>
      )}
    </form>
  );
}

function Check(props: { name: string; title: string; hint: string; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 ${props.disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" name={props.name} defaultChecked={props.defaultChecked} disabled={props.disabled} className="mt-1 size-5 accent-navy-500" />
      <span>
        <span className="block font-semibold text-navy-700">{props.title}</span>
        <span className="block text-sm text-ink-500">{props.hint}</span>
      </span>
    </label>
  );
}

function Radio(props: { name: string; value: string; title: string; hint: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-sand-400 has-checked:ring-2 has-checked:ring-navy-500">
      <input type="radio" name={props.name} value={props.value} defaultChecked={props.defaultChecked} className="mt-1 size-5 accent-navy-500" />
      <span>
        <span className="block font-semibold text-navy-700">{props.title}</span>
        <span className="block text-sm text-ink-500">{props.hint}</span>
      </span>
    </label>
  );
}
