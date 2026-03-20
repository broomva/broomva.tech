"use client";

import {
  ArrowUp,
  Check,
  Copy,
  Headphones,
  Linkedin,
  Pause,
  Share2,
  Twitter,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ------------------------------------------------------------------ */
/*  Text-to-Speech                                                     */
/* ------------------------------------------------------------------ */

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

interface ListenButtonProps {
  html: string;
  title: string;
}

function ListenButton({ html, title }: ListenButtonProps) {
  const [playing, setPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setPlaying(false);
    utteranceRef.current = null;
  }, []);

  const play = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    stop();

    const text = `${title}. ${stripHtml(html)}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;

    // prefer a natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Samantha") ||
          v.name.includes("Google") ||
          v.name.includes("Natural")),
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }, [html, title, stop]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={playing ? stop : play}
          aria-label={playing ? "Stop listening" : "Listen to post"}
          className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--ag-border-subtle)] text-text-muted transition hover:border-ai-blue/40 hover:text-ai-blue"
        >
          {playing ? (
            <Pause className="size-4" />
          ) : (
            <Headphones className="size-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {playing ? "Stop" : "Listen"}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  Share                                                              */
/* ------------------------------------------------------------------ */

interface ShareButtonProps {
  title: string;
  summary: string;
  slug: string;
}

function ShareButton({ title, summary, slug }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined" ? window.location.href : slug;

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({ title, text: summary, url });
    } catch {}
  }, [title, summary, url]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  // if native share is available (mobile), use that directly
  if (typeof navigator !== "undefined" && "share" in navigator) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleNativeShare}
            aria-label="Share"
            className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--ag-border-subtle)] text-text-muted transition hover:border-ai-blue/40 hover:text-ai-blue"
          >
            <Share2 className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Share</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Share"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--ag-border-subtle)] text-text-muted transition hover:border-ai-blue/40 hover:text-ai-blue"
            >
              <Share2 className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Share</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="border-[var(--ag-border-default)] bg-[var(--ag-bg-surface)]"
      >
        <DropdownMenuItem onClick={handleCopy}>
          {copied ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied ? "Copied!" : "Copy link"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={twitterUrl} target="_blank" rel="noopener noreferrer">
            <Twitter className="size-4" />
            Share on X
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={linkedinUrl} target="_blank" rel="noopener noreferrer">
            <Linkedin className="size-4" />
            Share on LinkedIn
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Scroll to top                                                      */
/* ------------------------------------------------------------------ */

function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--ag-border-subtle)] text-text-muted transition hover:border-ai-blue/40 hover:text-ai-blue"
        >
          <ArrowUp className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Back to top</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                            */
/* ------------------------------------------------------------------ */

interface ContentToolbarProps {
  html: string;
  title: string;
  summary: string;
  slug: string;
}

export function ContentToolbar({
  html,
  title,
  summary,
  slug,
}: ContentToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <ListenButton html={html} title={title} />
      <ShareButton title={title} summary={summary} slug={slug} />
      <ScrollToTop />
    </div>
  );
}
