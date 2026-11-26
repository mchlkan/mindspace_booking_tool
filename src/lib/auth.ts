import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/transport";
import { LoginLinkEmail } from "@/lib/email/templates/login-link";

const { organisers, loginTokens, authSessions, emailLog } = schema;
const MINUTE = 60_000;

export const SESSION_COOKIE = "ms_session";
export const LOGIN_LINK_MINUTES = 15;
export const SESSION_DAYS = 30;
/** Max sign-in emails per organiser per 15 minutes. */
const LINKS_PER_WINDOW = 3;

export type Organiser = {
  id: string;
  name: string;
  email: string;
  role: "trainer" | "events_manager" | "admin";
  status: "pending" | "approved" | "disabled";
  photoUrl: string | null;
  paymentLink: string | null;
};

const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------------------
// Sign-in links
// ---------------------------------------------------------------------------

/**
 * Emails a one-time sign-in link if the address belongs to an organiser who
 * isn't disabled. Says nothing either way, so the form can't be used to find
 * out who is an organiser.
 */
export async function requestLoginLink(email: string, now = new Date()): Promise<void> {
  const [org] = await db
    .select({ id: organisers.id, name: organisers.name, email: organisers.email, status: organisers.status })
    .from(organisers)
    .where(sql`lower(${organisers.email}) = ${email.trim().toLowerCase()}`);
  if (!org || org.status === "disabled") return;

  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)`.mapWith(Number) })
    .from(loginTokens)
    .where(and(eq(loginTokens.organiserId, org.id), gt(loginTokens.createdAt, new Date(now.getTime() - 15 * MINUTE))));
  if (recent >= LINKS_PER_WINDOW) return;

  const token = newToken();
  await db.insert(loginTokens).values({
    organiserId: org.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + LOGIN_LINK_MINUTES * MINUTE),
    createdAt: now,
  });

  const { id } = await sendEmail({
    to: org.email,
    subject: "Your Mindspace sign-in link",
    react: LoginLinkEmail({
      firstName: org.name.split(/\s+/)[0],
      url: appUrl(`/auth/verify?token=${token}`),
      minutes: LOGIN_LINK_MINUTES,
    }),
  });
  await db.insert(emailLog).values({ type: "login_link", toEmail: org.email, resendId: id });
}

/** Who a (still valid, unused) sign-in link is for, without using it up. */
export async function peekLoginToken(token: string, now = new Date()) {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const [row] = await db
    .select({ name: organisers.name, email: organisers.email })
    .from(loginTokens)
    .innerJoin(organisers, eq(organisers.id, loginTokens.organiserId))
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)));
  return row ?? null;
}

/**
 * Uses up a sign-in link and starts a login session.
 * Returns the session token for the cookie, or null if the link is invalid,
 * expired or already used.
 */
export async function consumeLoginToken(token: string, now = new Date()) {
  if (!/^[\w-]{43}$/.test(token)) return null;
  return db.transaction(async (tx) => {
    const [used] = await tx
      .update(loginTokens)
      .set({ usedAt: now })
      .where(
        and(eq(loginTokens.tokenHash, hashToken(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)),
      )
      .returning({ organiserId: loginTokens.organiserId });
    if (!used) return null;

    const [org] = await tx.select({ status: organisers.status }).from(organisers).where(eq(organisers.id, used.organiserId));
    if (!org || org.status === "disabled") return null;

    const sessionToken = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * MINUTE);
    await tx.insert(authSessions).values({
      organiserId: used.organiserId,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      createdAt: now,
    });
    return { sessionToken, expiresAt };
  });
}

/** The organiser a session token belongs to, if the session is still valid. */
export async function organiserForSessionToken(token: string, now = new Date()): Promise<Organiser | null> {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const [row] = await db
    .select({
      id: organisers.id,
      name: organisers.name,
      email: organisers.email,
      role: organisers.role,
      status: organisers.status,
      photoUrl: organisers.photoUrl,
      paymentLink: organisers.paymentLink,
    })
    .from(authSessions)
    .innerJoin(organisers, eq(organisers.id, authSessions.organiserId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, now)));
  if (!row || row.status === "disabled") return null;
  return row;
}

export async function deleteSession(token: string) {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
}

// ---------------------------------------------------------------------------
// Cookie helpers (Next.js request context only)
// ---------------------------------------------------------------------------

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in organiser for this request, or null. Cached per request. */
export const getCurrentOrganiser = cache(async (): Promise<Organiser | null> => {
  await connection(); // per-request only: sign-in state must never be prerendered
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? organiserForSessionToken(token) : null;
});

/**
 * For organiser pages and actions. Not signed in → /login.
 * Signed in but not approved yet → /dashboard/pending (unless allowPending).
 */
export async function requireOrganiser(opts: { allowPending?: boolean } = {}): Promise<Organiser> {
  const me = await getCurrentOrganiser();
  if (!me) redirect("/login");
  if (me.status !== "approved" && !opts.allowPending) redirect("/dashboard/pending");
  return me;
}

/** Can this organiser manage this session? Owners and admins only. */
export function canManage(me: Organiser, session: { organiserId: string }) {
  return me.role === "admin" || session.organiserId === me.id;
}
