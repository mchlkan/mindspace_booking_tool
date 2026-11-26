"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireOrganiser } from "@/lib/auth";
import { notifySessionChanged, notifySessionsCancelled, scheduleReminderIfDue } from "@/lib/notifications";
import { cancelSessions, createSessions, setPaymentStatus, updateProfile, updateSession } from "@/lib/organiser";
import { fieldErrors, readSessionForm, repeatFields, sessionFields } from "@/lib/session-input";
import { saveImage, UploadError } from "@/lib/uploads";

// Every action re-checks who is signed in: server actions can be called
// directly, not only through our forms.

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string | boolean>;
  saved?: boolean;
};

function afterResponse(label: string, work: () => Promise<unknown>) {
  after(async () => {
    try {
      await work();
    } catch (err) {
      console.error(`[dashboard] ${label} failed`, err);
    }
  });
}

async function bannerFrom(fd: FormData): Promise<{ url?: string | null; error?: string }> {
  try {
    if (fd.get("removeBanner") === "on") return { url: null };
    const url = await saveImage(fd.get("banner"), "banners");
    return { url: url ?? undefined };
  } catch (err) {
    if (err instanceof UploadError) return { error: err.message };
    throw err;
  }
}

export async function createSessionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOrganiser();
  const raw = readSessionForm(fd);
  const values = { ...raw, price: raw.priceCents } as Record<string, string | boolean>;

  const fields = sessionFields.safeParse(raw);
  const repeat = repeatFields.safeParse(raw);
  if (!fields.success || !repeat.success) {
    return {
      fieldErrors: {
        ...(fields.success ? {} : fieldErrors(fields.error)),
        ...(repeat.success ? {} : fieldErrors(repeat.error)),
      },
      values,
    };
  }

  const banner = await bannerFrom(fd);
  if (banner.error) return { fieldErrors: { banner: banner.error }, values };

  const result = await createSessions(me, fields.data, repeat.data, banner.url ?? null);
  if (!result.ok) {
    return result.field ? { fieldErrors: { [result.field]: result.message }, values } : { error: result.message, values };
  }
  redirect(`/dashboard/sessions/${result.ids[0]}?created=${result.ids.length}`);
}

export async function updateSessionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOrganiser();
  const id = String(fd.get("id") ?? "");
  const raw = readSessionForm(fd);
  const values = { ...raw, price: raw.priceCents } as Record<string, string | boolean>;

  const fields = sessionFields.safeParse(raw);
  if (!fields.success) return { fieldErrors: fieldErrors(fields.error), values };

  const banner = await bannerFrom(fd);
  if (banner.error) return { fieldErrors: { banner: banner.error }, values };

  const result = await updateSession(me, id, fields.data, banner.url);
  if (!result.ok) {
    return result.field ? { fieldErrors: { [result.field]: result.message }, values } : { error: result.message, values };
  }
  if (result.timeChanged || result.locationChanged) {
    const previous = result.previous;
    afterResponse("change notice", () => notifySessionChanged(id, previous));
  }
  redirect(`/dashboard/sessions/${id}?saved=1`);
}

export async function cancelSessionAction(fd: FormData) {
  const me = await requireOrganiser();
  const id = String(fd.get("id") ?? "");
  const scope = fd.get("scope") === "following" ? "following" : "one";
  const result = await cancelSessions(me, id, scope);
  if (!result.ok) redirect(`/dashboard/sessions/${id}/cancel?error=${encodeURIComponent(result.message)}`);
  const ids = result.ids;
  afterResponse("cancellation notice", () => notifySessionsCancelled(ids));
  redirect(`/dashboard/sessions/${id}?cancelled=${ids.length}`);
}

export async function setPaymentStatusAction(fd: FormData) {
  const me = await requireOrganiser();
  const bookingId = String(fd.get("bookingId") ?? "");
  const to = fd.get("to") === "paid" ? "paid" : "unpaid";
  const result = await setPaymentStatus(me, bookingId, to);
  if (result.ok && result.becameConfirmed) {
    afterResponse("reminder", () => scheduleReminderIfDue(bookingId));
  }
  // Stay on the page (keeps the scroll position) and re-render it with fresh data.
  refresh();
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100),
  paymentLink: z
    .string()
    .trim()
    .transform((s) => s || null)
    .pipe(
      z
        .url({ protocol: /^https$/, message: "Use a full https:// link, e.g. your Revolut or PayPal.me link." })
        .max(300)
        .nullable(),
    ),
});

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOrganiser({ allowPending: true });
  const values = { name: String(fd.get("name") ?? ""), paymentLink: String(fd.get("paymentLink") ?? "") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  let photoUrl: string | null | undefined;
  try {
    photoUrl = fd.get("removePhoto") === "on" ? null : ((await saveImage(fd.get("photo"), "photos")) ?? undefined);
  } catch (err) {
    if (err instanceof UploadError) return { fieldErrors: { photo: err.message }, values };
    throw err;
  }
  await updateProfile(me, { ...parsed.data, photoUrl });
  return { saved: true, values };
}
