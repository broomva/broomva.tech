import { NotesList } from "@/components/site/notes-list";
import { getContentList } from "@/lib/content";

export const metadata = {
  title: "Notes",
  description:
    "Short operational notes and quick takes from day-to-day agent engineering work.",
  openGraph: {
    title: "Notes | broomva.tech",
    description:
      "Short-form entries capturing one idea, one pattern, or one lesson from agent engineering work.",
    url: "https://broomva.tech/notes",
    images: [
      {
        url: "https://broomva.tech/notes/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Notes | broomva.tech",
      },
    ],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Notes | broomva.tech",
    description:
      "Short-form entries capturing one idea, one pattern, or one lesson from agent engineering work.",
    images: ["https://broomva.tech/notes/opengraph-image"],
  },
};

export default async function NotesPage() {
  const entries = await getContentList("notes");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          Notes
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          Short-form entries I can publish quickly and cross-post. Each note
          captures one idea, one pattern, or one lesson.
        </p>
      </header>
      <NotesList entries={entries} />
    </main>
  );
}
