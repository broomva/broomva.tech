interface ProseContentProps {
	html: string;
}

export function ProseContent({ html }: ProseContentProps) {
	return (
		<article
			className="prose prose-invert prose-zinc max-w-none prose-headings:font-display prose-headings:text-zinc-100 prose-a:text-emerald-300 hover:prose-a:text-emerald-200 prose-strong:text-zinc-100"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
