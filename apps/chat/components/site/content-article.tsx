"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ContentToolbar } from "./content-toolbar";
import { PostReactions } from "./post-reactions";
import { ProseContent } from "./prose-content";
import { ReadingProgress } from "./reading-progress";
import { useToolbarDock } from "./toolbar-dock-context";

interface ContentArticleProps {
  html: string;
  title: string;
  summary: string;
  slug: string;
  tags?: string[];
  readingTime: number;
  audioSrc?: string;
}

const DOCK_THRESHOLD = 200;

export function ContentArticle({
  html,
  title,
  summary,
  slug,
  tags,
  readingTime,
  audioSrc,
}: ContentArticleProps) {
  const [shouldDock, setShouldDock] = useState(false);
  const { setDocked } = useToolbarDock();

  useEffect(() => {
    function handleScroll() {
      const past = window.scrollY > DOCK_THRESHOLD;
      setShouldDock(past);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setDocked(shouldDock, { html, title, summary, slug, audioSrc });
    return () => setDocked(false);
  }, [shouldDock, setDocked, html, title, summary, slug, audioSrc]);

  return (
    <>
      <ReadingProgress />

      <div className="sticky top-16 z-40 flex justify-end">
        <AnimatePresence>
          {!shouldDock && (
            <motion.div
              className="glass rounded-full px-2 py-1.5"
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.9 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              <ContentToolbar
                html={html}
                title={title}
                summary={summary}
                slug={slug}
                audioSrc={audioSrc}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Meta: reading time + tags */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted">
          {readingTime} min read
        </span>
        {tags && tags.length > 0 && (
          <>
            <span className="text-text-muted/40">&middot;</span>
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
