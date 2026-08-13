import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Mono,
  Playfair_Display,
  Source_Serif_4,
} from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "./globals.css";

const display = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const body = Source_Serif_4({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Airing — AI Ring Sizing from One Photo",
    template: "%s · Airing",
  },
  description:
    "Measure your ring size with a guided phone camera or calibrated screen sizer. Credit-card scale, US · UK · EU · JP sizes. Nothing uploaded.",
  openGraph: {
    title: "Airing — AI Ring Sizing from One Photo",
    description:
      "Guided camera scan with a credit card reference — or measure on your screen. Private, on-device sizing.",
    type: "website",
    images: [{ url: "/icon.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#b8934a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
