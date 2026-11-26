import { createEvent } from "ics";

type CalendarInput = {
  bookingId: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  url: string;
  cancelled?: boolean;
  /** Must increase each time the event changes, so calendars apply the update. */
  sequence?: number;
};

/**
 * An .ics calendar event for a booking. METHOD:PUBLISH ("add this event"),
 * not an invitation, so calendars don't ask participants to RSVP.
 * The UID is stable per booking, so re-sending updates the same event.
 */
export function bookingIcs(input: CalendarInput): string {
  const { error, value } = createEvent({
    uid: `booking-${input.bookingId}@mindspace`,
    productId: "mindspace/booking",
    method: "PUBLISH",
    title: input.title,
    description: input.description,
    location: input.location,
    url: input.url,
    start: input.startsAt.getTime(),
    startInputType: "utc",
    startOutputType: "utc",
    end: input.endsAt.getTime(),
    endInputType: "utc",
    endOutputType: "utc",
    status: input.cancelled ? "CANCELLED" : "CONFIRMED",
    busyStatus: "BUSY",
    sequence: input.sequence ?? 0,
  });
  if (error || !value) throw error ?? new Error("Could not create calendar event");
  return value;
}
