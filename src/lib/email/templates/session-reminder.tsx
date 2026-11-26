import { Button, Heading, Section, Text } from "@react-email/components";
import { Details, EmailLayout, h1, p, primaryButton } from "./layout";

export type SessionReminderProps = {
  firstName: string;
  title: string;
  when: string;
  location: string;
  host: string;
  mat: "reserved" | "own" | null;
  /** e.g. "Bring €5 in cash" when paying on site and not yet paid. */
  paymentNote: string | null;
  bookingUrl: string;
};

export function SessionReminderEmail(props: SessionReminderProps) {
  const rows: [string, string][] = [
    ["When", props.when],
    ["Where", props.location],
    ["With", props.host],
  ];
  if (props.mat) rows.push(["Mat", props.mat === "reserved" ? "We'll have one for you" : "Bring your own"]);

  return (
    <EmailLayout preview={`See you tomorrow at ${props.title}`}>
      <Heading as="h1" style={h1}>
        See you tomorrow!
      </Heading>
      <Text style={p}>
        Hi {props.firstName}, a friendly reminder that {props.title} is tomorrow. Time to make some space for yourself.
      </Text>
      <Details rows={rows} />
      {props.paymentNote && <Text style={p}>{props.paymentNote}</Text>}
      <Section style={{ margin: "0 0 18px" }}>
        <Button href={props.bookingUrl} style={primaryButton}>
          View my booking
        </Button>
      </Section>
    </EmailLayout>
  );
}

SessionReminderEmail.PreviewProps = {
  firstName: "Sofia",
  title: "Sunrise Yoga",
  when: "Sat 28 Nov, 07:30–08:30",
  location: "Nova SBE, Rooftop terrace",
  host: "Ana Costa",
  mat: "reserved",
  paymentNote: "Please bring €5 in cash.",
  bookingUrl: "http://localhost:3000/b/example",
} satisfies SessionReminderProps;
