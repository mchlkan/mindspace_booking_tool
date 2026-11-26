import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, h1, p, primaryButton, small } from "./layout";

export type LoginLinkProps = { firstName: string; url: string; minutes: number };

export function LoginLinkEmail({ firstName, url, minutes }: LoginLinkProps) {
  return (
    <EmailLayout preview="Your Mindspace sign-in link">
      <Heading as="h1" style={h1}>
        Sign in to Mindspace
      </Heading>
      <Text style={p}>Hi {firstName}, tap the button to sign in to your organiser dashboard.</Text>
      <Section style={{ margin: "0 0 18px" }}>
        <Button href={url} style={primaryButton}>
          Sign in
        </Button>
      </Section>
      <Text style={small}>
        The link works once and expires in {minutes} minutes. If you didn&apos;t ask to sign in, you can ignore this
        email.
      </Text>
    </EmailLayout>
  );
}

LoginLinkEmail.PreviewProps = {
  firstName: "Ana",
  url: "http://localhost:3000/auth/verify?token=example",
  minutes: 15,
} satisfies LoginLinkProps;
