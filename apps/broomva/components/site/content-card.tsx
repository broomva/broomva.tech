import Link from "next/link";

interface ContentCardProps {
  title: string;
  summary: string;
  href: string;
  meta?: string;
  badge?: string;
}

export function ContentCard({
  title,
  summary,
  href,
  meta,
  badge,
}: ContentCardProps) {
  return (
    <Link
      href={href as any}
      className="glass-card group block"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-xl text-text-primary transition group-hover:text-ai-blue">
          {title}
        </h3>
        {badge ? (
          <span className="glass-badge">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{summary}</p>
      {meta ? (
        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-text-muted">
          {meta}
        </p>
      ) : null}
    </Link>
  );
}
