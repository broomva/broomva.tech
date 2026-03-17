interface PageHeroProps {
	title: string;
	description: string;
}

export function PageHero({ title, description }: PageHeroProps) {
	return (
		<section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/30 px-6 py-10 sm:px-10">
			<div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
			<h1 className="relative font-display text-4xl text-zinc-100 sm:text-5xl">{title}</h1>
			<p className="relative mt-4 max-w-3xl text-base leading-relaxed text-zinc-300 sm:text-lg">{description}</p>
		</section>
	);
}
