import { ContentCard } from "@/app/components/content-card";
import { PageHero } from "@/app/components/page-hero";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getContentList } from "@/util/content";

export const metadata = {
	title: "Notes",
	description: "Short operational notes and quick takes from day-to-day agent engineering work.",
};

export default async function NotesPage() {
	const entries = await getContentList("notes");

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero
					title="Notes"
					description="Short-form entries I can publish quickly and cross-post. Each note captures one idea, one pattern, or one lesson."
				/>
				<section className="mt-10 grid gap-4 md:grid-cols-2">
					{entries.map((entry) => (
						<ContentCard
							key={entry.slug}
							title={entry.title}
							summary={entry.summary}
							href={`/notes/${entry.slug}`}
							meta={formatDate(entry.date)}
						/>
					))}
				</section>
			</main>
		</div>
	);
}
