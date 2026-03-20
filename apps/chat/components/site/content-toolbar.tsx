"use client";

import {
  ArrowUp,
  Check,
  Copy,
  Headphones,
  Linkedin,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
  Square,
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
import { useAudioPlayback } from "@/providers/audio-playback-provider";

/* ------------------------------------------------------------------ */
/*  Text-to-Speech                                                     */
/* ------------------------------------------------------------------ */

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

const CHARS_PER_SECOND = 12.5;

function getPreferredVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      (v.name.includes("Samantha") ||
        v.name.includes("Google") ||
        v.name.includes("Natural")),
  );
}

type SpeechState = "idle" | "playing" | "paused";

const BTN_CLASS =
  "inline-flex size-9 items-center justify-center rounded-full border border-[var(--ag-border-subtle)] text-text-muted transition hover:border-ai-blue/40 hover:text-ai-blue";

/* ---- Global audio player (uses AudioPlaybackProvider) ---- */

function GlobalAudioPlayer({
  src,
  slug,
  title,
}: {
  src: string;
  slug: string;
  title: string;
}) {
  const { track, state, currentTime, duration, play, pause, resume, stop, skip } =
    useAudioPlayback();

  const isThisTrack = track?.audioSrc === src;
  const activeState = isThisTrack ? state : "idle";

  const handlePlay = useCallback(() => {
    if (isThisTrack && state === "paused") {
      resume();
    } else {
      play({ audioSrc: src, slug, title });
    }
  }, [isThisTrack, state, resume, play, src, slug, title]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (activeState === "idle") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Listen to post"
            className={BTN_CLASS}
          >
            <Headphones className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Listen</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => skip(-10)}
            aria-label="Back 10 seconds"
            className={BTN_CLASS}
          >
            <RotateCcw className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">-10s</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={activeState === "playing" ? pause : resume}
            aria-label={activeState === "playing" ? "Pause" : "Resume"}
            className={BTN_CLASS}
          >
            {activeState === "playing" ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {activeState === "playing" ? "Pause" : "Resume"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => skip(10)}
            aria-label="Forward 10 seconds"
            className={BTN_CLASS}
          >
            <RotateCw className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">+10s</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop"
            className={BTN_CLASS}
          >
            <Square className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Stop</TooltipContent>
      </Tooltip>

      <span className="ml-1 text-[10px] tabular-nums text-text-muted">
        {formatTime(currentTime)}/{formatTime(duration)}
      </span>
    </div>
  );
}

/* ---- Web Speech API fallback (used when no audio file) ---- */

interface ListenButtonProps {
  html: string;
  title: string;
}

function SpeechFallbackPlayer({ html, title }: ListenButtonProps) {
  const [state, setState] = useState<SpeechState>("idle");
  const [progress, setProgress] = useState(0);
  const fullTextRef = useRef("");
  const charOffsetRef = useRef(0);
  const lastBoundaryRef = useRef(0);

  useEffect(() => {
    fullTextRef.current = `${title}. ${stripHtml(html)}`;
  }, [html, title]);

  const speakFrom = useCallback((offset: number) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const text = fullTextRef.current;
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    charOffsetRef.current = clampedOffset;
    lastBoundaryRef.current = clampedOffset;

    if (clampedOffset >= text.length) {
      setState("idle");
      setProgress(0);
      charOffsetRef.current = 0;
      return;
    }

    const remaining = text.slice(clampedOffset);
    const utterance = new SpeechSynthesisUtterance(remaining);
    utterance.rate = 1;
    utterance.pitch = 1;

    const voice = getPreferredVoice();
    if (voice) utterance.voice = voice;

    utterance.onboundary = (e) => {
      const absPos = clampedOffset + e.charIndex;
      lastBoundaryRef.current = absPos;
      setProgress(text.length > 0 ? (absPos / text.length) * 100 : 0);
    };

    utterance.onend = () => {
      setState("idle");
      setProgress(0);
      charOffsetRef.current = 0;
    };

    utterance.onerror = (e) => {
      if (e.error === "interrupted") return;
      setState("idle");
      setProgress(0);
    };

    window.speechSynthesis.speak(utterance);
    setState("playing");
  }, []);

  const handlePlay = useCallback(() => {
    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
    } else {
      speakFrom(charOffsetRef.current);
    }
  }, [state, speakFrom]);

  const handlePause = useCallback(() => {
    window.speechSynthesis.pause();
    setState("paused");
  }, []);

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setState("idle");
    setProgress(0);
    charOffsetRef.current = 0;
  }, []);

  const handleSkip = useCallback(
    (seconds: number) => {
      const charDelta = Math.round(seconds * CHARS_PER_SECOND);
      const newOffset = lastBoundaryRef.current + charDelta;
      speakFrom(newOffset);
    },
    [speakFrom],
  );

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  if (state === "idle") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Listen to post"
            className={BTN_CLASS}
          >
            <Headphones className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Listen</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleSkip(-10)}
            aria-label="Back 10 seconds"
            className={BTN_CLASS}
          >
            <RotateCcw className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">-10s</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={state === "playing" ? handlePause : handlePlay}
            aria-label={state === "playing" ? "Pause" : "Resume"}
            className={BTN_CLASS}
          >
            {state === "playing" ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {state === "playing" ? "Pause" : "Resume"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleSkip(10)}
            aria-label="Forward 10 seconds"
            className={BTN_CLASS}
          >
            <RotateCw className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">+10s</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop"
            className={BTN_CLASS}
          >
            <Square className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Stop</TooltipContent>
      </Tooltip>

      <span className="ml-1 text-[10px] tabular-nums text-text-muted">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

/* ---- Unified listen button ---- */

interface UnifiedListenProps {
  html: string;
  title: string;
  slug: string;
  audioSrc?: string;
}

function ListenButton({ html, title, slug, audioSrc }: UnifiedListenProps) {
  if (audioSrc) {
    return <GlobalAudioPlayer src={audioSrc} slug={slug} title={title} />;
  }
  return <SpeechFallbackPlayer html={html} title={title} />;
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
  audioSrc?: string;
}

export function ContentToolbar({
  html,
  title,
  summary,
  slug,
  audioSrc,
}: ContentToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <ListenButton html={html} title={title} slug={slug} audioSrc={audioSrc} />
      <ShareButton title={title} summary={summary} slug={slug} />
      <ScrollToTop />
    </div>
  );
}
