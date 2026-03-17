import Link from "next/link";

interface ContentCardProps {
	title: string;
	summary: string;
	href: string;
	meta?: string;
	badge?: string;
}

export function ContentCard({ title, summary, href, meta, badge }: ContentCardProps) {
	return (
		<Link
			href={href}
			className="group block rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-zinc-900"
		>
			<div className="mb-2 flex items-center justify-between gap-3">
				<h3 className="font-display text-xl text-zinc-100 transition group-hover:text-emerald-200">{title}</h3>
				{badge ? (
					<span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-300">
						{badge}
					</span>
				) : null}
			</div>
			<p className="text-sm leading-relaxed text-zinc-300">{summary}</p>
			{meta ? <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-500">{meta}</p> : null}
		</Link>
	);
}
