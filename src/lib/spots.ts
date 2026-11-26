import { sql } from "drizzle-orm";
import { bookings } from "@/db/schema";

/**
 * A spot is taken by a confirmed booking, or by a payment-link booking whose
 * hold hasn't run out yet. Expired holds free their spot immediately, even
 * before anything marks them "expired".
 */
export const holdsSpot = sql`(
  ${bookings.status} = 'confirmed'
  or (${bookings.status} = 'pending_payment' and ${bookings.holdExpiresAt} > now())
)`;

/** Count of bookings currently holding a spot (use with a join on bookings). */
export const spotsTakenSql = sql<number>`count(${bookings.id}) filter (where ${holdsSpot})`.mapWith(Number);

/** Count of spot-holding bookings that also asked for a mat. */
export const matsTakenSql = sql<number>`count(${bookings.id}) filter (where ${holdsSpot} and ${bookings.matRequested})`.mapWith(Number);

/** How long a payment-link booking holds its spot while unpaid (PRD assumption). */
export const PAYMENT_HOLD_HOURS = 24;
