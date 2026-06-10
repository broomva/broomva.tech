"use client";

import type { Route } from "next";
import {
  ArrowRight,
  Code2,
  Compass,
  Eye,
  History,
  Paperclip,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ScrollReveal } from "@/components/site/scroll-reveal";
import ThermodynamicGrid from "@/components/ui/interactive-thermodynamic-grid";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const socials = [
  { href: "/profile", label: "Profile" },
  { href: "https://github.com/broomva", label: "GitHub" },
  { href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
  { href: "https://x.com/broomva_tech", label: "X" },
  { href: "/links", label: "Link hub" },
];

const suggestionPills: Array<{
  icon: LucideIcon;
  label: string;
  prompt: string;
}> = [
  { icon: Pencil, label: "Write", prompt: "Help me write a " },
  { icon: Eye, label: "Learn", prompt: "Explain how " },
  { icon: Code2, label: "Code", prompt: "Write code that " },
  { icon: Compass, label: "Explore", prompt: "Tell me about " },
];

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

export function HeroSection({ userName }: { userName?: string | null }) {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Two-pass render: the server can't know the visitor's local hour, so the
  // greeting starts null (server HTML and first client render both say
  // "Hello") and an effect swaps in the time-based greeting after hydration.
  // Computing it during render trips React #418 (hydration text mismatch)
  // whenever the server's UTC hour lands in a different bucket.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(getTimeGreeting());
  }, []);
  const firstName = userName?.split(" ")[0] ?? null;

  const submitChat = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  }, [chatInput, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitChat();
      }
    },
    [submitChat],
  );

  const handlePillClick = useCallback(
    (prompt: string) => {
      setChatInput(prompt);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(prompt.length, prompt.length);
        }
      });
    },
    [],
  );

  return (
    <section className="relative -mt-16 flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 pt-16 sm:px-6">
      <ThermodynamicGrid
        resolution={12}
        coolingFactor={0.96}
        className="absolute inset-0 z-0"
      />

      <div className="pointer-events-none absolute -right-32 top-1/4 z-[1] h-[28rem] w-[28rem] rounded-full bg-ai-blue/10 blur-[120px]" />
      <div className="pointer-events-none absolute -left-24 bottom-1/4 z-[1] h-96 w-96 rounded-full bg-accent-blue/8 blur-[100px]" />

      <div className="pointer-events-none relative z-10 mx-auto w-full max-w-3xl text-center">
        {/* Greeting */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="text-balance font-display text-4xl leading-[1.15] text-text-primary sm:text-5xl md:text-6xl"
        >
          {firstName ? (
            <>
              {greeting ?? "Hello"},{" "}
              <span className="relative inline-block text-ai-blue">
                {firstName}
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
                  className="absolute -bottom-1 left-0 h-[2px] w-full origin-left rounded-full bg-ai-blue/50"
                />
              </span>
            </>
          ) : (
            <>
              Building systems
              <br />
              that last
            </>
          )}
        </motion.h1>

        {/* Subtitle — changes when logged in */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: 0.2,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="text-pretty mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg"
        >
          {firstName
            ? "How can I help you today?"
            : "Agent OS architect and AI engineering lead. Builder of multi-tenant agentic platforms, lakehouse-native data substrates, and the open-source Rust Agent OS — reliability engineering across software, body, and craft."}
        </motion.p>

        {/* Social links — only when not logged in */}
        {!firstName && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.35,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="mt-6 flex flex-wrap justify-center gap-3 pointer-events-auto"
          >
            {socials.map((item) =>
              item.href.startsWith("/") ? (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className="inline-flex min-h-10 items-center rounded-full border border-border/40 bg-bg-elevated/40 px-5 py-2 text-xs font-medium tracking-wide text-text-secondary shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] backdrop-blur-md transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:border-ai-blue/40 hover:bg-bg-elevated/60 hover:text-text-primary hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_0_16px_oklch(0.60_0.12_260/0.12)] active:scale-[0.96]"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center rounded-full border border-border/40 bg-bg-elevated/40 px-5 py-2 text-xs font-medium tracking-wide text-text-secondary shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] backdrop-blur-md transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:border-ai-blue/40 hover:bg-bg-elevated/60 hover:text-text-primary hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_0_16px_oklch(0.60_0.12_260/0.12)] active:scale-[0.96]"
                >
                  {item.label}
                </a>
              ),
            )}
          </motion.div>
        )}

        {/* Chat input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: firstName ? 0.3 : 0.5,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className={`pointer-events-auto mx-auto w-full max-w-xl ${firstName ? "mt-10" : "mt-8"}`}
        >
          <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-[color-mix(in_oklab,var(--ag-bg-surface)_calc(var(--ag-glass-medium)*100%),transparent)] shadow-[inset_0_1px_0_oklch(1_0_0/0.04),var(--ag-shadow-md)] backdrop-blur-[var(--ag-blur-lg)] backdrop-saturate-[1.4] backdrop-brightness-[1.05] transition-[border-color,box-shadow] duration-200 focus-within:border-ai-blue/40 focus-within:shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_0_24px_oklch(0.60_0.12_260/0.10)]">
            <textarea
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="How can I help you today?"
              rows={1}
              className="w-full resize-none bg-transparent px-5 pb-12 pt-4 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none sm:text-base"
            />

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-lg text-text-muted/50 transition-[background-color,color,transform] hover:bg-bg-elevated/60 hover:text-text-secondary active:scale-[0.96]"
                  aria-label="Attach file"
                >
                  <Paperclip className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-lg text-text-muted/50 transition-[background-color,color,transform] hover:bg-bg-elevated/60 hover:text-text-secondary active:scale-[0.96]"
                  aria-label="Chat history"
                  onClick={() => router.push("/chat")}
                >
                  <History className="size-4" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={submitChat}
                disabled={!chatInput.trim()}
                className="flex size-10 items-center justify-center rounded-full bg-ai-blue/90 text-white shadow-sm transition-[background-color,box-shadow,opacity,transform] hover:bg-ai-blue hover:shadow-glow-blue active:scale-[0.96] disabled:opacity-30 disabled:hover:bg-ai-blue/90 disabled:hover:shadow-sm disabled:active:scale-100"
                aria-label="Send"
              >
                <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: firstName ? 0.5 : 0.7, duration: 0.5 }}
            className="mt-2 text-center text-[11px] text-text-muted/40"
          >
            AI can make mistakes. Please check important information.
          </motion.p>
        </motion.div>

        {/* Suggestion pills */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: firstName ? 0.45 : 0.65,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mt-5 flex flex-wrap justify-center gap-2.5 pointer-events-auto"
        >
          {suggestionPills.map((pill) => {
            const Icon = pill.icon;
            return (
              <button
                key={pill.label}
                type="button"
                onClick={() => handlePillClick(pill.prompt)}
                className="flex min-h-10 items-center gap-1.5 rounded-full border border-border/40 bg-bg-elevated/30 px-4 py-2 text-xs font-medium text-text-secondary backdrop-blur-sm transition-[background-color,border-color,color,transform] duration-200 hover:border-ai-blue/30 hover:bg-bg-elevated/50 hover:text-text-primary active:scale-[0.96]"
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {pill.label}
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="pointer-events-none absolute bottom-8 z-10 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
          Scroll
        </span>
        <motion.svg
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-text-muted"
        >
          <path
            d="M8 3v10M4 9l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Install                                                            */
/* ------------------------------------------------------------------ */

export function InstallSection() {
  const [copied, setCopied] = useState(false);
  const cmd = "curl -fsSL https://broomva.tech/api/install | bash";

  const copy = useCallback(() => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cmd]);

  return (
    <section className="mt-16 sm:mt-20">
      <ScrollReveal>
        <div className="glass rounded-3xl p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
            Get Started
          </p>
          <h2 className="text-balance mt-3 font-display text-3xl text-text-primary sm:text-4xl">
            Install
          </h2>
          <p className="text-pretty mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            One command installs the Broomva CLI, the broomva.tech skill, and
            the full bstack (24 agent skills across 7 layers).
          </p>

          <div className="mt-6">
            <button
              type="button"
              onClick={copy}
              className="group glass-card flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-mono transition-[border-color,transform] active:scale-[0.96] hover:border-ai-blue/40"
            >
              <code className="min-w-0 overflow-x-auto whitespace-nowrap text-sm text-text-primary sm:text-base">
                <span className="text-text-muted">$ </span>
                {cmd}
              </code>
              <span className="shrink-0 text-xs text-text-muted transition group-hover:text-ai-blue">
                {copied ? "Copied!" : "Copy"}
              </span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <span className="rounded-full border border-border/40 px-3 py-1 text-xs text-text-muted">
              cargo install broomva
            </span>
            <a
              href="https://crates.io/crates/broomva"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border/40 px-3 py-1 text-xs text-text-muted transition hover:border-ai-blue/50 hover:text-ai-blue"
            >
              crates.io
            </a>
            <a
              href="https://github.com/broomva/broomva.tech/tree/main/crates/broomva-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border/40 px-3 py-1 text-xs text-text-muted transition hover:border-ai-blue/50 hover:text-ai-blue"
            >
              Source
            </a>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
