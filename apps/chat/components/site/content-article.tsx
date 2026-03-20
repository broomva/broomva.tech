"use client";

import { ContentToolbar } from "./content-toolbar";
import { PostReactions } from "./post-reactions";
import { ProseContent } from "./prose-content";
import { ReadingProgress } from "./reading-progress";

interface ContentArticleProps {
  html: string;
  title: string;
  summary: string;
  slug: string;
  tags?: string[];
  readingTime: number;
}

export function ContentArticle({
  html,
  title,
  summary,
  slug,
  tags,
  readingTime,
}: ContentArticleProps) {
  return (
    <>
      <ReadingProgress />

      {/* Sticky toolbar */}
      <div className="sticky top-3 z-40 flex justify-end">
        <div className="glass rounded-full px-2 py-1.5">
          <ContentToolbar
            html={html}
            title={title}
            summary={summary}
            slug={slug}
          />
        </div>
      </div>

      {/* Meta: reading time + tags */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted">
          {readingTime} min read
        </span>
        {tags && tags.length > 0 && (
          <>
            <span className="text-text-muted/40">·</span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="glass-badge text-[11px]">
                  {tag}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Article body */}
      <div className="mt-6 glass rounded-2xl p-6 sm:p-8">
        <ProseContent html={html} />
      </div>

      {/* Reactions */}
      <div className="mt-8 flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
          Reactions
        </p>
        <PostReactions slug={slug} />
      </div>
    </>
  );
}
