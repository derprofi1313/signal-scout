import type { Metadata, Viewport } from "next";
import { Chivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Chivo({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const description =
  "Git-native evidence CI for competitor-page changes: exact source fragments, deterministic classifications, and reviewable hashes.";

export const metadata: Metadata = {
  metadataBase: new URL("https://github.com/derprofi1313/signal-scout"),
  title: {
    default: "Signal Scout — Evidence that holds still",
    template: "%s — Signal Scout",
  },
  description,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://github.com/derprofi1313/signal-scout",
    siteName: "Signal Scout",
    title: "Signal Scout — Evidence that holds still",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EDF3F6",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <Link className="skip-link" href="#main-content">
          Skip to content
        </Link>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <div className="shell site-footer__inner">
            <p>Deterministic evidence, not strategic advice.</p>
            <p className="mono-label">signal-scout/evidence@1</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
