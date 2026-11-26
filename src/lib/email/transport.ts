import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { Resend } from "resend";

export type EmailAttachment = { filename: string; content: string; contentType: string };

export type OutgoingEmail = {
  to: string;
  subject: string;
  react: ReactElement;
  attachments?: EmailAttachment[];
  /** Send later instead of now. */
  scheduledAt?: Date;
  /** Makes retries safe: Resend won't send the same key twice. */
  idempotencyKey?: string;
};

/** What the local outbox stores per email (dev preview only). */
export type OutboxEmail = {
  id: string;
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
  scheduledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

const DEFAULT_REPLY_TO = "mindspace.club@novasbe.pt";

function from() {
  // Must be an address on a domain verified in Resend.
  return process.env.EMAIL_FROM ?? "Mindspace <bookings@example.com>";
}
function replyTo() {
  return process.env.EMAIL_REPLY_TO ?? DEFAULT_REPLY_TO;
}

/**
 * Where emails go:
 *  - RESEND_API_KEY set → sent through Resend
 *  - otherwise, on Vercel → not sent, just logged (so bookings still work
 *    before email is set up)
 *  - otherwise (local dev, tests) → saved to the outbox folder for preview
 *    at /dev/emails
 */
export function emailMode(): "resend" | "skip" | "outbox" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.VERCEL) return "skip";
  return "outbox";
}

// The outbox is local-dev only; the turbopackIgnore hints below stop the
// bundler from tracing (and deploying) the whole project because of it.
export function outboxDir() {
  return process.env.EMAIL_OUTBOX_DIR ?? ".outbox";
}

let resendClient: Resend | undefined;
function resend() {
  return (resendClient ??= new Resend(process.env.RESEND_API_KEY));
}

/** Sends (or schedules) an email. Returns the provider id for the email log. */
export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const html = await render(email.react);
  const text = await render(email.react, { plainText: true });
  const mode = emailMode();

  if (mode === "resend") {
    const { data, error } = await resend().emails.send(
      {
        from: from(),
        replyTo: replyTo(),
        to: email.to,
        subject: email.subject,
        html,
        text,
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString("base64"),
          contentType: a.contentType,
        })),
        scheduledAt: email.scheduledAt?.toISOString(),
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    );
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
    return { id: data!.id };
  }

  if (mode === "skip") {
    console.warn(`[email] RESEND_API_KEY not set, not sending "${email.subject}"`);
    return { id: `skipped-${randomUUID()}` };
  }

  const id = `local-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const record: OutboxEmail = {
    id,
    from: from(),
    replyTo: replyTo(),
    to: email.to,
    subject: email.subject,
    html,
    text,
    attachments: email.attachments ?? [],
    scheduledAt: email.scheduledAt?.toISOString() ?? null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
  };
  await mkdir(/*turbopackIgnore: true*/ outboxDir(), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path.join(outboxDir(), `${id}.json`), JSON.stringify(record, null, 2));
  return { id };
}

/** Cancels an email that was scheduled for later. */
export async function cancelScheduledEmail(id: string): Promise<void> {
  if (id.startsWith("skipped-")) return;
  if (id.startsWith("local-")) {
    const email = await readOutboxEmail(id);
    if (!email) return;
    email.cancelledAt = new Date().toISOString();
    await writeFile(/*turbopackIgnore: true*/ path.join(outboxDir(), `${id}.json`), JSON.stringify(email, null, 2));
    return;
  }
  const { error } = await resend().emails.cancel(id);
  if (error) throw new Error(`Resend cancel ${id}: ${error.name}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Local outbox reading (dev preview + tests)
// ---------------------------------------------------------------------------

export async function listOutbox(): Promise<OutboxEmail[]> {
  let files: string[];
  try {
    files = await readdir(/*turbopackIgnore: true*/ outboxDir());
  } catch {
    return [];
  }
  const emails = await Promise.all(
    files.filter((f) => f.endsWith(".json")).map((f) => readOutboxEmail(f.slice(0, -5))),
  );
  return emails
    .filter((e): e is OutboxEmail => !!e)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readOutboxEmail(id: string): Promise<OutboxEmail | null> {
  if (!/^local-[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(outboxDir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}
