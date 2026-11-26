import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

/** Brand colours as plain hex: email clients don't support CSS variables. */
export const c = {
  navy700: "#3b4359",
  navy500: "#53617f",
  sun300: "#fdf3a9",
  sun500: "#ecdf67",
  sand200: "#d8d3c8",
  cream100: "#f7f4f0",
  cream50: "#fbfbfa",
  ink900: "#232833",
  ink500: "#5f5f5f",
};

export const font = "'League Spartan', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      {/* No web font: most email clients ignore them. League Spartan shows where
          installed, otherwise Helvetica/Arial. */}
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: c.cream100, margin: 0, padding: "24px 0", fontFamily: font }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: c.cream50, borderRadius: 16, overflow: "hidden" }}>
          <Section style={{ backgroundColor: c.navy500, padding: "20px 28px" }}>
            <Text style={{ margin: 0, color: c.sun300, fontSize: 22, fontWeight: 800, letterSpacing: 1, lineHeight: "24px" }}>
              MIND
            </Text>
            <Text style={{ margin: 0, color: c.sun300, fontSize: 11, fontWeight: 700, letterSpacing: 5, lineHeight: "14px" }}>
              SPACE
            </Text>
          </Section>
          <Section style={{ padding: "28px 28px 8px" }}>{children}</Section>
          <Hr style={{ borderColor: c.sand200, margin: "8px 28px" }} />
          <Section style={{ padding: "8px 28px 24px" }}>
            <Text style={{ ...small, margin: 0 }}>
              Questions? Just reply to this email and the Mindspace team will get back to you.
            </Text>
            <Text style={{ ...small, margin: "8px 0 0" }}>@nova_mindspace</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const h1: CSSProperties = { margin: "0 0 12px", color: c.navy700, fontSize: 26, lineHeight: "30px", fontWeight: 800 };
export const p: CSSProperties = { margin: "0 0 14px", color: c.ink900, fontSize: 16, lineHeight: "24px" };
export const small: CSSProperties = { color: c.ink500, fontSize: 13, lineHeight: "19px" };
export const primaryButton: CSSProperties = {
  backgroundColor: c.sun500,
  color: c.navy700,
  borderRadius: 999,
  padding: "14px 26px",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  textDecoration: "none",
  display: "inline-block",
};
export const secondaryButton: CSSProperties = {
  ...primaryButton,
  backgroundColor: c.navy500,
  color: c.cream50,
};

/** Label/value list of session details. */
export function Details({ rows }: { rows: [string, string][] }) {
  return (
    <Section style={{ backgroundColor: c.cream100, borderRadius: 12, padding: "14px 18px", margin: "4px 0 18px" }}>
      {rows.map(([label, value]) => (
        <Text key={label} style={{ margin: "3px 0", fontSize: 15, lineHeight: "22px", color: c.ink900 }}>
          <span style={{ color: c.ink500 }}>{label}: </span>
          {value}
        </Text>
      ))}
    </Section>
  );
}
