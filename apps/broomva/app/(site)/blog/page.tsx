import Link from "next/link";
import { formatDate } from "@/lib/date";
import { getContentList } from "@/lib/content";

export const metadata = {
  title: "Blog",
  description:
    "Long-form essays on agent engineering, control theory, and the empirical study of self-improving systems.",
  openGraph: {
    title: "Blog | broomva.tech",
    description:
      "Long-form essays on agent engineering, control theory, and the empirical study of self-improving systems.",
    url: "https://broomva.tech/blog",
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Blog | broomva.tech",
    description:
      "Long-form essays on agent engineering, control theory, and the empirical study of self-improving systems.",
  },
};

export default async function BlogPage() {
  const entries = await getContentList("posts");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          Blog
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          Long-form essays: control theory applied to agent systems, empirical
          results (including the negative ones), and what the field is missing.
        </p>
      </header>
      <section className="mt-10 flex flex-col gap-8">
        {entries.length === 0 ? (
          <p className="text-base text-text-secondary">No posts yet.</p>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.slug}
              className="border-border-subtle border-b pb-8 last:border-b-0"
            >
              <p className="text-text-muted text-xs uppercase tracking-[0.18em]">
                {formatDate(entry.date)}
                {entry.readingTime ? ` · ${entry.readingTime} min read` : null}
              </p>
              <h2 className="mt-2 font-display text-2xl text-text-primary">
                <Link
                  className="transition-colors hover:text-accent"
                  href={`/blog/${entry.slug}`}
                >
                  {entry.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-text-secondary">
                {entry.summary}
              </p>
              {entry.tags.length > 0 ? (
                <p className="mt-3 text-text-muted text-xs">
                  {entry.tags.slice(0, 6).join(" · ")}
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
