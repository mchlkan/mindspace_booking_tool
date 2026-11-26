"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { bookingInput, cancelBooking, createBooking, reportPaid, type BookingFailure } from "@/lib/booking";
import { cancelReminders, scheduleReminderIfDue, sendBookingConfirmation } from "@/lib/notifications";

/** Email work runs after the response, so booking stays fast; failures are logged, not shown. */
function afterResponse(label: string, work: () => Promise<unknown>) {
  after(async () => {
    try {
      await work();
    } catch (err) {
      console.error(`[email] ${label} failed`, err);
    }
  });
}

export type BookingFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"fullName" | "email" | "paymentMethod" | "consent" | "matRequested", string>>;
  values?: { fullName: string; email: string; matRequested: boolean; paymentMethod: string; consent: boolean };
};

const FAILURE_MESSAGES: Record<BookingFailure, string> = {
  not_found: "This session isn't available for booking any more.",
  started: "This session has already started, so booking is closed.",
  full: "Sorry, the last spot was just taken. This session is now full.",
  mats_full: "The last mat was just taken. Untick the mat option to book with your own mat.",
  no_mats: "This session doesn't offer mats.",
  payment_method: "Please choose how you'd like to pay.",
  already_booked: "You're already booked for this session with this email.",
};

export async function bookSessionAction(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const raw = {
    sessionId: String(formData.get("sessionId") ?? ""),
    privateSlug: (formData.get("privateSlug") as string | null) || undefined,
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    matRequested: formData.get("matRequested") === "on",
    paymentMethod: (formData.get("paymentMethod") as string | null) || null,
    consent: formData.get("consent") === "on",
  };
  const values = {
    fullName: raw.fullName,
    email: raw.email,
    matRequested: raw.matRequested,
    paymentMethod: raw.paymentMethod ?? "",
    consent: raw.consent,
  };

  const parsed = bookingInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: BookingFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<BookingFormState["fieldErrors"]>;
      if (key === "sessionId" as string) return { error: FAILURE_MESSAGES.not_found, values };
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  const result = await createBooking(parsed.data);
  if (!result.ok) {
    if (result.reason === "payment_method") {
      return { fieldErrors: { paymentMethod: FAILURE_MESSAGES.payment_method }, values };
    }
    return { error: FAILURE_MESSAGES[result.reason], values };
  }

  const bookingId = result.bookingId;
  afterResponse("booking confirmation", () => sendBookingConfirmation(bookingId));
  redirect(`/b/${result.token}`);
}

export async function reportPaidAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const bookingId = await reportPaid(token);
  if (bookingId) afterResponse("reminder", () => scheduleReminderIfDue(bookingId));
  redirect(`/b/${token}`);
}

export async function cancelBookingAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const result = await cancelBooking(token);
  if (result.ok) {
    const bookingId = result.bookingId;
    afterResponse("cancel reminders", () => cancelReminders([bookingId]));
    redirect(`/b/${token}?cancelled=1`);
  }
  redirect(`/b/${token}/cancel?error=${result.reason}`);
}
