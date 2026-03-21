import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";

import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AudioPlaybackProvider } from "@/providers/audio-playback-provider";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: {
    default: config.appTitle ?? config.appName ?? config.appName,
    template: `%s | ${config.appName}`,
  },
  description: config.appDescription,
  alternates: {
    canonical: config.appUrl,
  },
  keywords: [
    "Agent OS",
    "AI agents",
    "autonomous software",
    "Rust",
    "Arcan",
    "harness engineering",
    "control metalayer",
    "orchestration runtime",
    "AI-native",
    "broomva",
  ],
  authors: [{ name: "Carlos D. Escobar-Valbuena", url: config.appUrl }],
  creator: "Carlos D. Escobar-Valbuena",
  publisher: config.organization.name,
  openGraph: {
    siteName: config.appName,
    url: config.appUrl,
    title: config.appTitle ?? config.appName,
    description: config.appDescription,
    images: [
      {
        url: `${config.appUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "broomva.tech — Building autonomous software systems",
      },
    ],
    locale: "en-US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@broomva",
    creator: "@broomva",
    title: config.appTitle ?? config.appName,
    description: config.appDescription,
    images: [
      {
        url: `${config.appUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "broomva.tech — Building autonomous software systems",
      },
    ],
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
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
  interactiveWidget: "resizes-content" as const,
};

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

const calSans = localFont({
  src: "../public/fonts/CalSans-SemiBold.ttf",
  variable: "--font-calsans",
});

const LIGHT_THEME_COLOR = "hsl(0 0% 97%)";
const DARK_THEME_COLOR = "oklch(0.12 0.02 275)";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geist.variable} ${geistMono.variable} ${calSans.variable}`}
      // `next-themes` injects an extra classname to the body element to avoid
      // visual flicker before hydration. Hence the `suppressHydrationWarning`
      // prop is necessary to avoid the React hydration mismatch warning.
      // https://github.com/pacocoursey/next-themes?tab=readme-ov-file#with-app
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-color-script" strategy="beforeInteractive">
          {THEME_COLOR_SCRIPT}
        </Script>
        {process.env.NODE_ENV !== "production" ? (
          <Script
            src="https://unpkg.com/react-scan/dist/auto.global.js"
            strategy="beforeInteractive"
          />
        ) : null}
      </head>
      <body className="antialiased">
        <Script
          src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
          strategy="beforeInteractive"
        />
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            disableTransitionOnChange
            enableSystem
          >
            <TooltipProvider>
              <AudioPlaybackProvider>
                <Toaster position="top-center" />
                {children}
              </AudioPlaybackProvider>
            </TooltipProvider>
          </ThemeProvider>
        </NuqsAdapter>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
