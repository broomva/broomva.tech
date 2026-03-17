import { ContentCard } from "@/app/components/content-card";
import { PageHero } from "@/app/components/page-hero";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getContentList } from "@/util/content";

export const metadata = {
	title: "Writing",
	description: "Long-form essays on harness engineering, interfaces, and building AI-native systems.",
};

export default async function WritingPage() {
	const entries = await getContentList("writing");

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero
					title="Writing"
					description="Canonical long-form notes from real implementation work: architecture decisions, tradeoffs, and operating models."
				/>
				<section className="mt-10 grid gap-4 md:grid-cols-2">
					{entries.map((entry) => (
						<ContentCard
							key={entry.slug}
							title={entry.title}
							summary={entry.summary}
							href={`/writing/${entry.slug}`}
							meta={formatDate(entry.date)}
						/>
					))}
				</section>
			</main>
		</div>
	);
}
