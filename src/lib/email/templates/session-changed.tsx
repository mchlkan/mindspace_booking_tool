import { Button, Heading, Section, Text } from "@react-email/components";
import { Details, EmailLayout, h1, p, primaryButton, small } from "./layout";

export type SessionChangedProps = {
  firstName: string;
  title: string;
  host: string;
  /** Only the lines that changed are shown as "was → now". */
  changes: { label: string; before: string; after: string }[];
  when: string;
  location: string;
  bookingUrl: string;
  canCancel: boolean;
};

export function SessionChangedEmail(props: SessionChangedProps) {
  return (
    <EmailLayout preview={`${props.title} has changed. Here are the new details`}>
      <Heading as="h1" style={h1}>
        Heads up: {props.title} has changed
      </Heading>
      <Text style={p}>
        Hi {props.firstName}, {props.host} updated the session you&apos;re booked for. Your spot is still yours.
      </Text>
      {props.changes.map((c) => (
        <Text key={c.label} style={p}>
          <strong>{c.label}:</strong> <s style={{ color: "#5f5f5f" }}>{c.before}</s> → <strong>{c.after}</strong>
        </Text>
      ))}
      <Details
        rows={[
          ["When", props.when],
          ["Where", props.location],
        ]}
      />
      <Section style={{ margin: "0 0 18px" }}>
        <Button href={props.bookingUrl} style={primaryButton}>
          View my booking
        </Button>
      </Section>
      <Text style={small}>
        The attached calendar file updates the event in your calendar.
        {props.canCancel ? " If the new time doesn't work for you, you can cancel from your booking page." : ""}
      </Text>
    </EmailLayout>
  );
}

SessionChangedEmail.PreviewProps = {
  firstName: "Sofia",
  title: "Sunrise Yoga",
  host: "Ana Costa",
  changes: [{ label: "Time", before: "Sat 28 Nov, 07:30–08:30", after: "Sat 28 Nov, 08:00–09:00" }],
  when: "Sat 28 Nov, 08:00–09:00",
  location: "Nova SBE, Rooftop terrace",
  bookingUrl: "http://localhost:3000/b/example",
  canCancel: true,
} satisfies SessionChangedProps;
