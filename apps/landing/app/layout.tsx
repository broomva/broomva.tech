import { Inter } from "@next/font/google";
import LocalFont from "@next/font/local";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import "../global.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

const calSans = LocalFont({
	src: "../public/fonts/CalSans-SemiBold.ttf",
	variable: "--font-calsans",
});

export const metadata: Metadata = {
	title: {
		default: "broomva.tech",
		template: "%s | broomva.tech",
	},
	description: "Building reliable agentic systems: interfaces, harness engineering, and AI-native workflows.",
	metadataBase: new URL("https://broomva.tech"),
	openGraph: {
		title: "broomva.tech",
		description: "Interfaces and harness engineering for AI-native workflows.",
		url: "https://broomva.tech",
		siteName: "broomva.tech",
		images: [
			{
				url: "/og.png",
				width: 1920,
				height: 1080,
			},
		],
		locale: "en-US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "broomva.tech",
		description: "Building reliable agentic systems.",
		images: ["/og.png"],
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={[inter.variable, calSans.variable].join(" ")}>
			<body className={`bg-black antialiased ${process.env.NODE_ENV === "development" ? "debug-screens" : ""}`}>
				{children}
				<SpeedInsights />
				<Analytics />
			</body>
		</html>
	);
}
