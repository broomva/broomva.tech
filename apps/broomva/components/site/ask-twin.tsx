"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { Route } from "next";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

/**
 * "Ask Carlos" — the public AI double (BRO-3994). Talks to POST /api/ask,
 * which is anonymous, grounded in public site content, and stores nothing.
 */

const SUGGESTIONS = [
  "Who are you?",
  "What are you working on right now?",
  "What could we build together?",
  "What is the Life Agent OS?",
];

const MAX_CHARS = 2_000;
const MAX_MESSAGES = 24;
const CONTACT = "carlos@broomva.tech";

const transport = new DefaultChatTransport({ api: "/api/ask" });

/**
 * Show the route's own wording: HTTP errors (400, 403, 429) arrive as
 * `{ "error": "…" }`, and a failed stream as the route's plain-text
 * fallback, which always names the contact address. Anything else (a
 * network failure, a proxy page) gets the generic line.
 */
function errorText(error: Error | undefined): string | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON — fall through
  }
  if (error.message.length < 300 && error.message.includes(CONTACT)) {
    return error.message;
  }
  return `Something went wrong. Try again, or write to ${CONTACT}.`;
}

function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const cls = "text-ai-blue underline underline-offset-2 hover:text-ai-blue/80";
  if (href?.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link className={cls} href={href as Route}>
        {children}
      </Link>
    );
  }
  return (
    <a className={cls} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export function AskTwin() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    transport,
  });
  const logRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const full = messages.length >= MAX_MESSAGES;

  // Keep the newest tokens in view while an answer streams. Runs after
  // every render on purpose: the streamed text changes without a new message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  function ask(text: string) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy || full) return;
    setInput("");
    sendMessage({ text: q });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(input);
    }
  }

  const shownError = errorText(error);

  return (
    <div className="pointer-events-auto mx-auto mt-8 w-full max-w-xl text-left">
      {messages.length > 0 && (
        <div
          aria-label="Conversation with Carlos's AI double"
          aria-live="polite"
          className="mb-3 max-h-[50vh] space-y-3 overflow-y-auto rounded-2xl border border-border/40 bg-bg-elevated/40 p-4 backdrop-blur-md"
          ref={logRef}
          role="log"
        >
          {messages.map((m) => {
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            if (m.role === "user") {
              return (
                <div className="flex justify-end" key={m.id}>
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-ai-blue/15 px-4 py-2 text-sm text-text-primary">
                    {text}
                  </p>
                </div>
              );
            }
            return (
              <div
                className="max-w-[95%] space-y-2 text-sm leading-relaxed text-text-secondary [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:text-text-primary [&_ul]:list-disc"
                key={m.id}
              >
                <ReactMarkdown components={{ a: MarkdownLink }}>
                  {text}
                </ReactMarkdown>
              </div>
            );
          })}
          {status === "submitted" && (
            <p className="text-sm text-text-muted">Thinking…</p>
          )}
          {shownError && (
            <p className="text-sm text-red-400" role="alert">
              {shownError}
            </p>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-[color-mix(in_oklab,var(--ag-bg-surface)_calc(var(--ag-glass-medium)*100%),transparent)] shadow-[inset_0_1px_0_oklch(1_0_0/0.04),var(--ag-shadow-md)] backdrop-blur-[var(--ag-blur-lg)] backdrop-saturate-[1.4] transition-[border-color,box-shadow] duration-200 focus-within:border-ai-blue/40">
        <label className="sr-only" htmlFor="ask-twin-input">
          Ask Carlos's AI double a question
        </label>
        <textarea
          className="w-full resize-none bg-transparent px-5 pb-12 pt-4 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none sm:text-base"
          disabled={full}
          id="ask-twin-input"
          maxLength={MAX_CHARS}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            full
              ? "Start a new conversation to keep asking"
              : "Ask me anything: who I am, what I build, how we could work together"
          }
          rows={2}
          value={input}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-3">
          {messages.length > 0 ? (
            <button
              className="text-xs text-text-muted transition hover:text-text-primary"
              onClick={() => {
                stop();
                setMessages([]);
              }}
              type="button"
            >
              New conversation
            </button>
          ) : (
            <span />
          )}
          {busy ? (
            <button
              className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-text-secondary transition hover:text-text-primary"
              onClick={() => stop()}
              type="button"
            >
              Stop
            </button>
          ) : (
            <button
              className="rounded-full bg-ai-blue px-4 py-1.5 text-xs font-medium text-white transition hover:bg-ai-blue/90 disabled:opacity-40"
              disabled={!input.trim() || full}
              onClick={() => ask(input)}
              type="button"
            >
              Ask
            </button>
          )}
        </div>
      </div>

      {messages.length === 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              className="rounded-full border border-border/40 bg-bg-elevated/40 px-3 py-1.5 text-xs text-text-secondary backdrop-blur-md transition hover:border-ai-blue/40 hover:text-text-primary"
              key={s}
              onClick={() => ask(s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
        An AI double of Carlos, answering from what's published on this site. It
        can be wrong, and this site doesn't store conversations. For anything
        binding, write to{" "}
        <a className="underline underline-offset-2" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        .
      </p>
    </div>
  );
}
