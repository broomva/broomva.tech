import Link from "next/link";

interface PromptCardProps {
  title: string;
  summary: string;
  href: string;
  category?: string;
  version?: string;
  model?: string;
  tags?: string[];
  meta?: string;
}

export function PromptCard({
  title,
  summary,
  href,
  category,
  version,
  model,
  tags,
  meta,
}: PromptCardProps) {
  return (
    <Link href={href as any} className="glass-card group block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-xl text-text-primary transition group-hover:text-ai-blue">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {version ? (
            <span className="glass-badge font-mono text-[10px]">
              v{version}
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {category ? (
          <span className="rounded-full bg-ai-blue/10 px-2.5 py-0.5 text-[11px] font-medium text-ai-blue">
            {category}
          </span>
        ) : null}
        {model ? (
          <span className="rounded-full bg-ai-blue/10 px-2.5 py-0.5 text-[11px] font-medium text-ai-blue">
            {model}
          </span>
        ) : null}
        {tags?.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-text-muted"
          >
            {tag}
          </span>
        ))}
        {meta ? (
          <span className="ml-auto text-xs uppercase tracking-[0.14em] text-text-muted">
            {meta}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
