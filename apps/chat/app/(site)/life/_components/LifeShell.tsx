"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TWEAKS,
  readTweaks,
  writeTweaks,
} from "../_lib/tweaks";
import type { MobileTab, TweaksState } from "../_lib/types";
import { useProsoponRun } from "../_lib/use-prosopon-run";
import type { LifeUserIdentity } from "./AnimaPane";
import { AnimaPopover } from "./AnimaPopover";
import { ChatColumn } from "./ChatColumn";
import { Dock } from "./Dock";
import { MiddleColumn } from "./MiddleColumn";
import { PaymentRequiredBanner } from "./PaymentRequiredBanner";
import { RightColumn } from "./RightColumn";
import { Topbar } from "./Topbar";
import { TweaksPanel } from "./TweaksPanel";

interface Props {
  projectSlug: string;
  displayName: string;
  eyebrow: string;
  /** Empty-state title for the chat column (project-aware copy). */
  emptyTitle?: string;
  emptyHint?: string;
  suggestions?: Array<{ label: string; prompt: string }>;
  /** Authed / anon identity threaded from the server page for Anima. */
  user?: LifeUserIdentity;
}

function usePersistedTweaks(): {
  tweaks: TweaksState;
  setTweaks: (patch: Partial<TweaksState>) => void;
} {
  // Default to the in-memory DEFAULTS; hydrate from localStorage on mount so
  // the SSR snapshot always matches DEFAULT_TWEAKS for the first render and
  // no layout shift happens.
  const [tweaks, setTweaksState] = useState<TweaksState>(DEFAULT_TWEAKS);

  useEffect(() => {
    setTweaksState(readTweaks());
  }, []);

  const setTweaks = useCallback((patch: Partial<TweaksState>) => {
    setTweaksState((prev) => {
      const next = { ...prev, ...patch };
      writeTweaks(next);
      return next;
    });
  }, []);

  return { tweaks, setTweaks };
}

export function LifeShell({
  projectSlug,
  displayName,
  eyebrow,
  emptyTitle,
  emptyHint,
  suggestions,
  user,
}: Props) {
  const { tweaks, setTweaks } = usePersistedTweaks();
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [animaOpen, setAnimaOpen] = useState(false);
  // Mobile tab bar — which of the three logical columns is foreground on a
  // narrow viewport. Ignored on desktop (≥1280px) where all three are shown.
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  // Live-only run state. The user's first message begins the first turn.
  const [state, setState, liveMeta] = useProsoponRun({
    projectSlug,
    enabled: true,
    autoStart: false,
  });

  const showPaymentBanner =
    liveMeta.status === "payment-required" && !!liveMeta.paymentQuote;

  // Cross-link highlight between chat tool calls and journal rows.
  const [toolHighlight, setToolHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!toolHighlight) return;
    const t = setTimeout(() => setToolHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [toolHighlight]);

  // Track last fs op timestamp for pulse animations on FileTree.
  const [lastOpTs, setLastOpTs] = useState(0);
  useEffect(() => {
    if (state.fsOps.length) setLastOpTs(Date.now());
  }, [state.fsOps.length]);

  const running = useMemo(
    () =>
      state.messages.length > 0 &&
      state.messages.some(
        (m) =>
          m.streamingText ||
          m.streamingThinking ||
          (m.tools || []).some((t) => t.status === "running"),
      ),
    [state.messages],
  );

  // Hotkey: ⌘. or Ctrl+. toggles the preferences panel.
  const tweaksHotkeyRef = useRef(setTweaksOpen);
  tweaksHotkeyRef.current = setTweaksOpen;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        tweaksHotkeyRef.current((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const setMiddleMode = useCallback(
    (m: TweaksState["middleMode"]) => setTweaks({ middleMode: m }),
    [setTweaks],
  );
  const setRightMode = useCallback(
    (m: TweaksState["rightMode"]) => setTweaks({ rightMode: m }),
    [setTweaks],
  );

  const crumb = {
    brand: "broomva.tech",
    project: `${projectSlug} — ${displayName.split(" — ")[1] ?? displayName}`,
  };

  return (
    <div
      className="life-shell-root"
      data-project={projectSlug}
      data-eyebrow={eyebrow}
      data-mobile-tab={mobileTab}
    >
      <div className="shell">
        <Topbar
          setAnimaOpen={(fn) => setAnimaOpen(fn(animaOpen))}
          crumb={crumb}
          user={user}
          projectSlug={projectSlug}
          onOpenPreferences={() => setTweaksOpen(true)}
        />
        <ChatColumn
          state={state}
          setState={setState}
          running={running}
          setToolHighlight={setToolHighlight}
          toolHighlight={toolHighlight}
          onSendMessage={liveMeta.sendMessage}
          modelLabel="openai/gpt-5-mini"
          emptyStateTitle={emptyTitle}
          emptyStateHint={emptyHint}
          suggestions={suggestions}
        />
        <MiddleColumn
          mode={tweaks.middleMode}
          setMode={setMiddleMode}
          state={state}
          toolHighlight={toolHighlight}
          setToolHighlight={setToolHighlight}
          lastOpTs={lastOpTs}
        />
        <RightColumn
          mode={tweaks.rightMode}
          setMode={setRightMode}
          state={state}
          liveMeta={liveMeta}
          user={user}
          projectSlug={projectSlug}
        />
        <Dock state={state} />
      </div>

      {/* Mobile-only bottom tab bar — CSS hides it above 768px. Uses
          a <div role="tablist"> rather than <nav> so the WAI-ARIA
          tablist semantics aren't double-wrapped inside a landmark. */}
      <div
        className="life-mobile-tabs"
        aria-label="Workspace view"
        role="tablist"
      >
        {(
          [
            ["chat", "Chat"],
            ["workspace", "Workspace"],
            ["inspector", "Inspector"],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            role="tab"
            aria-selected={mobileTab === id}
            className={`life-mobile-tabs__btn ${
              mobileTab === id ? "is-active" : ""
            }`}
            onClick={() => setMobileTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {animaOpen && <AnimaPopover onClose={() => setAnimaOpen(false)} />}

      {showPaymentBanner && liveMeta.paymentQuote && (
        <PaymentRequiredBanner
          quote={liveMeta.paymentQuote}
          projectSlug={projectSlug}
          onApprove={(header) => liveMeta.retryWithPayment?.(header)}
          onCancel={() => liveMeta.dismiss?.()}
        />
      )}

      <TweaksPanel
        tweaks={tweaks}
        setTweaks={setTweaks}
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
      />
    </div>
  );
}
