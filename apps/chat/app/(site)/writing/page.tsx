import { WritingList } from "@/components/site/writing-list";
import { getContentList } from "@/lib/content";

export const metadata = {
  title: "Writing",
  description:
    "Long-form essays on harness engineering, control systems, and building AI-native infrastructure.",
  openGraph: {
    title: "Writing | broomva.tech",
    description:
      "Architecture decisions, tradeoffs, and operating models from real implementation work.",
    url: "https://broomva.tech/writing",
    images: [
      {
        url: "https://broomva.tech/writing/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Writing | broomva.tech",
      },
    ],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Writing | broomva.tech",
    description:
      "Architecture decisions, tradeoffs, and operating models from real implementation work.",
    images: ["https://broomva.tech/writing/opengraph-image"],
  },
};

export default async function WritingPage() {
  const entries = await getContentList("writing");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          Writing
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          Architecture decisions, tradeoffs, and operating models from real
          implementation work.
        </p>
      </header>
      <WritingList entries={entries} />
    </main>
  );
}
