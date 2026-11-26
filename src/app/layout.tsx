import type { Metadata, Viewport } from "next";
import { League_Spartan } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Brand "writing font": general text and event headlines.
const leagueSpartan = League_Spartan({
  variable: "--font-league-spartan",
  subsets: ["latin"],
});

// Brand "logo font": logo and branding content (SIL OFL, see src/fonts).
const openSauce = localFont({
  variable: "--font-open-sauce",
  src: [
    { path: "../fonts/open-sauce-sans-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/open-sauce-sans-latin-700-normal.woff2", weight: "700" },
    { path: "../fonts/open-sauce-sans-latin-800-normal.woff2", weight: "800" },
  ],
});

export const metadata: Metadata = {
  title: "Mindspace · Book a class",
  description:
    "Book Mindspace yoga, pilates and meditation classes and club events. No account needed.",
  appleWebApp: { capable: true, title: "Mindspace", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#53617f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${leagueSpartan.variable} ${openSauce.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
