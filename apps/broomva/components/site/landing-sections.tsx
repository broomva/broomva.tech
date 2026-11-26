"use client";

import { motion } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AskTwin } from "@/components/site/ask-twin";
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
          {
            "Agent OS architect and AI engineering lead. Builder of multi-tenant agentic platforms, lakehouse-native data substrates, and the open-source Rust Agent OS — reliability engineering across software, body, and craft."
          }
        </motion.p>

        {/* Social links */}
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

        {/* "Ask Carlos" — the public AI double (BRO-3994) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <AskTwin />
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
