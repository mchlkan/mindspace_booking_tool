import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { Details, EmailLayout, h1, p, primaryButton, secondaryButton, small } from "./layout";

export type BookingConfirmedProps = {
  firstName: string;
  title: string;
  when: string; // e.g. "Sat 28 Nov, 07:30–08:30"
  location: string;
  host: string;
  price: string; // "€5" or "Free"
  mat: "reserved" | "own" | null; // null for events
  status: "confirmed" | "pending_payment";
  payment: "cash" | "link" | null;
  holdUntil: string | null; // pending only
  paymentLink: string | null;
  bookingUrl: string;
  cancelUntil: string; // e.g. "Fri 27 Nov, 07:30"
};

export function BookingConfirmedEmail(props: BookingConfirmedProps) {
  const pending = props.status === "pending_payment";
  const rows: [string, string][] = [
    ["When", props.when],
    ["Where", props.location],
    ["With", props.host],
    ["Price", props.price],
  ];
  if (props.mat) rows.push(["Mat", props.mat === "reserved" ? "Reserved for you" : "Bring your own"]);
  if (props.payment === "cash") rows.push(["Payment", "Cash at the session"]);

  return (
    <EmailLayout
      preview={pending ? `Almost there: pay to keep your spot at ${props.title}` : `You're booked for ${props.title}`}
    >
      <Heading as="h1" style={h1}>
        {pending ? "Almost there!" : "You're booked!"}
      </Heading>
      <Text style={p}>
        Hi {props.firstName},{" "}
        {pending
          ? `your spot at ${props.title} is held until ${props.holdUntil}. Pay with the link below, then tap "I've paid" on your booking page to confirm it.`
          : `your spot at ${props.title} is confirmed. We can't wait to create some space together.`}
      </Text>

      <Details rows={rows} />

      {pending && props.paymentLink && (
        <Section style={{ margin: "0 0 12px" }}>
          <Button href={props.paymentLink} style={secondaryButton}>
            Pay {props.price}
          </Button>
        </Section>
      )}
      <Section style={{ margin: "0 0 18px" }}>
        <Button href={props.bookingUrl} style={primaryButton}>
          {pending ? "I've paid / view booking" : "View my booking"}
        </Button>
      </Section>

      <Text style={p}>The calendar invite is attached, so you can add it to your calendar in one tap.</Text>
      <Text style={small}>
        Can&apos;t make it? You can{" "}
        <Link href={props.bookingUrl} style={{ color: "#53617f" }}>
          cancel your booking
        </Link>{" "}
        until {props.cancelUntil}, so someone else can take your spot.
      </Text>
    </EmailLayout>
  );
}

/** Sample data for the dev preview. */
BookingConfirmedEmail.PreviewProps = {
  firstName: "Sofia",
  title: "Sunrise Yoga",
  when: "Sat 28 Nov, 07:30–08:30",
  location: "Nova SBE, Rooftop terrace",
  host: "Ana Costa",
  price: "€5",
  mat: "reserved",
  status: "pending_payment",
  payment: "link",
  holdUntil: "Fri 27 Nov, 15:44",
  paymentLink: "https://example.com/pay/ana",
  bookingUrl: "http://localhost:3000/b/example",
  cancelUntil: "Fri 27 Nov, 07:30",
} satisfies BookingConfirmedProps;
