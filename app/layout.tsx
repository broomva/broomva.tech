import { Inter } from "@next/font/google";
import LocalFont from "@next/font/local";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Metadata } from "next";
import "../global.css";

export const metadata: Metadata = {
  title: {
    default: "broomva.tech",
    template: "%s | broomva.tech",
  },
  description: "Broomva's personal website",
  openGraph: {
    title: "broomva.tech",
    description:
      "Arcan AI | Senior ML Engineer | Databricks | Blockchain | Quantum",
    url: "https://broomva.tech",
    siteName: "broomva.tech",
    images: [
      {
        url: "https://broomva.tech/og.png",
        width: 1920,
        height: 1080,
      },
    ],
    locale: "en-US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    shortcut: "/favicon.png",
  },
};
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const calSans = LocalFont({
  src: "../public/fonts/CalSans-SemiBold.ttf",
  variable: "--font-calsans",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={[inter.variable, calSans.variable].join(" ")}>
      <body
        className={`bg-black ${process.env.NODE_ENV === "development" ? "debug-screens" : undefined
          }`}
      >
        {children}
        <SpeedInsights/>
        <Analytics/>
      </body>
    </html>
  );
}
