"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  clearSessionCookie,
  consumeLoginToken,
  deleteSession,
  requestLoginLink,
  SESSION_COOKIE,
  setSessionCookie,
} from "@/lib/auth";

export type AuthFormState = {
  sent?: boolean;
  email?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "role", string>>;
  values?: { name?: string; email?: string; role?: string };
};

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address."));

export async function requestLoginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = String(formData.get("email") ?? "");
  const email = emailSchema.safeParse(raw);
  if (!email.success) return { fieldErrors: { email: email.error.issues[0].message }, values: { email: raw } };
  await requestLoginLink(email.data);
  return { sent: true, email: email.data };
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(100),
  email: emailSchema,
  role: z.enum(["trainer", "events_manager"], "Please choose what you'd like to organise."),
});

/**
 * Asks to become an organiser. New accounts start as "pending" until an admin
 * approves them. Either way we email a sign-in link, which also proves the
 * person owns the email address.
 */
export async function signupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: AuthFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "email" | "role";
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  const { name, email, role } = parsed.data;
  await db
    .insert(schema.organisers)
    .values({ name, email, role, status: "pending" })
    // Email already registered (any case): keep the existing account.
    .onConflictDoNothing();
  await requestLoginLink(email);
  return { sent: true, email };
}

export async function verifyLoginAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const session = await consumeLoginToken(token);
  if (!session) redirect("/auth/verify?error=invalid");
  await setSessionCookie(session.sessionToken, session.expiresAt);
  redirect("/dashboard");
}

export async function signOutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  await clearSessionCookie();
  redirect("/login");
}
