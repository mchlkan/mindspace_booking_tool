import { Button, Heading, Section, Text } from "@react-email/components";
import { Details, EmailLayout, h1, p, primaryButton, small } from "./layout";

export type SessionCancelledProps = {
  firstName: string;
  title: string;
  host: string;
  when: string;
  location: string;
  paid: boolean;
  browseUrl: string;
};

export function SessionCancelledEmail(props: SessionCancelledProps) {
  return (
    <EmailLayout preview={`${props.title} on ${props.when} is cancelled`}>
      <Heading as="h1" style={h1}>
        {props.title} is cancelled
      </Heading>
      <Text style={p}>
        Hi {props.firstName}, we&apos;re sorry: {props.host} had to cancel this session. You don&apos;t need to do
        anything.
      </Text>
      <Details
        rows={[
          ["When", props.when],
          ["Where", props.location],
        ]}
      />
      {props.paid && (
        <Text style={p}>
          If you already paid, {props.host} will sort out your refund directly. Just reply to this email if you have
          questions.
        </Text>
      )}
      <Section style={{ margin: "0 0 18px" }}>
        <Button href={props.browseUrl} style={primaryButton}>
          Find another session
        </Button>
      </Section>
      <Text style={small}>The attached calendar file removes the event from your calendar.</Text>
    </EmailLayout>
  );
}

SessionCancelledEmail.PreviewProps = {
  firstName: "Sofia",
  title: "Sunrise Yoga",
  host: "Ana Costa",
  when: "Sat 28 Nov, 07:30–08:30",
  location: "Nova SBE, Rooftop terrace",
  paid: true,
  browseUrl: "http://localhost:3000/",
} satisfies SessionCancelledProps;
