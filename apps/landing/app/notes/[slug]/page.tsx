import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/app/components/page-hero";
import { ProseContent } from "@/app/components/prose-content";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getAllSlugs, getContentBySlug } from "@/util/content";

interface NotePageProps {
	params: {
		slug: string;
	};
}

export async function generateStaticParams() {
	const slugs = await getAllSlugs("notes");
	return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
	const entry = await getContentBySlug("notes", params.slug);

	if (!entry) {
		return {
			title: "Note not found",
		};
	}

	return {
		title: entry.title,
		description: entry.summary,
	};
}

export default async function NotePage({ params }: NotePageProps) {
	const entry = await getContentBySlug("notes", params.slug);
	if (!entry) {
		notFound();
	}

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero title={entry.title} description={entry.summary} />
				<p className="mt-8 text-xs uppercase tracking-[0.18em] text-zinc-400">{formatDate(entry.date)}</p>
				<div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
					<ProseContent html={entry.html} />
				</div>
			</main>
		</div>
	);
}
