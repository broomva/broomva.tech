"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCENARIO_LABELS, SCENARIOS } from "../_lib/scenarios";
import {
  DEFAULT_TWEAKS,
  readTweaks,
  writeTweaks,
} from "../_lib/tweaks";
import type { ScenarioId, TweaksState } from "../_lib/types";
import { useReplay } from "../_lib/use-replay";
import { useLiveRun } from "../_lib/use-live-run";
import { PaymentRequiredBanner } from "./PaymentRequiredBanner";
import { AnimaPopover } from "./AnimaPopover";
import { ChatColumn } from "./ChatColumn";
import { Dock } from "./Dock";
import { ExperimentalCanvas } from "./ExperimentalCanvas";
import { MiddleColumn } from "./MiddleColumn";
import { RightColumn } from "./RightColumn";
import { Topbar } from "./Topbar";
import { TweaksPanel } from "./TweaksPanel";

interface Props {
  projectSlug: string;
  scenarioId: ScenarioId;
  displayName: string;
  eyebrow: string;
  /**
   * When true, the shell reads events from /api/life/run/<slug> over SSE
   * instead of replaying the local scenario clock. Phase 2 enables it for
   * Sentinel; Materiales stays on local replay until the live pipeline with
   * web_search lands in a follow-up PR.
   */
  liveStream?: boolean;
}

function usePersistedTweaks(initialScenario: ScenarioId): {
  tweaks: TweaksState;
  setTweaks: (patch: Partial<TweaksState>) => void;
} {
  // Default the in-memory tweaks to the project's scenario; localStorage,
  // if present, overrides — but we hydrate on mount so the SSR snapshot
  // matches DEFAULT_TWEAKS for the first render.
  const [tweaks, setTweaksState] = useState<TweaksState>({
    ...DEFAULT_TWEAKS,
    scenario: initialScenario,
  });

  useEffect(() => {
    const stored = readTweaks();
    setTweaksState({ ...stored, scenario: initialScenario });
    // Only run once on mount per project — if the user changes projects the
    // dynamic route remounts the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  scenarioId,
  displayName,
  eyebrow,
  liveStream = false,
}: Props) {
  const { tweaks, setTweaks } = usePersistedTweaks(scenarioId);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [animaOpen, setAnimaOpen] = useState(false);

  const script = useMemo(
    () => SCENARIOS[tweaks.scenario] ?? SCENARIOS.refactor,
    [tweaks.scenario],
  );

  const [playing, setPlaying] = useState<boolean>(tweaks.autoplay);
  // When the user changes scenario in tweaks, restart the clock.
  useEffect(() => {
    setPlaying(tweaks.autoplay);
  }, [tweaks.scenario, tweaks.autoplay]);

  // Replay state (local scenario clock) — used when liveStream is false OR
  // when the user has paused / switched scenarios in the Tweaks panel.
  const [replayState, setReplayState] = useReplay(script, playing && !liveStream);

  // Live SSE state — used only when the project is wired for live streaming
  // AND the user hasn't overridden the scenario via Tweaks. If they do, we
  // fall back to the local replay clock so the Tweaks panel keeps working.
  const liveEnabled =
    liveStream && playing && tweaks.scenario === scenarioId;
  const [liveState, setLiveState, liveMeta] = useLiveRun({
    projectSlug,
    enabled: liveEnabled,
  });

  // The downstream UI is agnostic to which source drove state — it only
  // reads { state, setState }.
  const state = liveEnabled ? liveState : replayState;
  const setState = liveEnabled ? setLiveState : setReplayState;

  // Paywall overlay — shows when the live runner returns 402 and we have
  // a quote. Approving triggers a retry with X-PAYMENT; cancel dismisses.
  const showPaymentBanner =
    liveEnabled &&
    liveMeta.status === "payment-required" &&
    !!liveMeta.paymentQuote;

  // Cross-link highlight between chat tool calls and journal rows.
  const [toolHighlight, setToolHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!toolHighlight) return;
    const t = setTimeout(() => setToolHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [toolHighlight]);

  // Track last fs op timestamp for pulse animations.
  const [lastOpTs, setLastOpTs] = useState(0);
  useEffect(() => {
    if (state.fsOps.length) setLastOpTs(Date.now());
  }, [state.fsOps.length]);

  const running =
    playing &&
    state.messages.length > 0 &&
    state.messages.some(
      (m) =>
        m.streamingText ||
        m.streamingThinking ||
        (m.tools || []).some((t) => t.status === "running"),
    );

  // Hotkey: ⌘. or Ctrl+. toggles tweaks panel.
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
    scenarioLabel: SCENARIO_LABELS[tweaks.scenario],
  };

  const rootClass = `life-shell-root ${tweaks.orbs ? "life-shell-root--orbs" : ""}`;

  return (
    <div className={rootClass} data-project={projectSlug} data-eyebrow={eyebrow}>
      <div
        className={`shell ${tweaks.layout === "experimental" ? "shell--experimental" : ""}`}
      >
        <Topbar
          setAnimaOpen={(fn) => setAnimaOpen(fn(animaOpen))}
          tweaks={tweaks}
          setTweaks={setTweaks}
          playing={playing}
          setPlaying={setPlaying}
          crumb={crumb}
        />
        {tweaks.layout === "classic" ? (
          <>
            <ChatColumn
              state={state}
              setState={setState}
              running={running}
              setToolHighlight={setToolHighlight}
              toolHighlight={toolHighlight}
              onSendMessage={liveEnabled ? liveMeta.sendMessage : undefined}
              sourceLabel={liveEnabled ? "live" : "mock"}
              modelLabel={liveEnabled ? "openai/gpt-5-mini" : undefined}
            />
            <MiddleColumn
              mode={tweaks.middleMode}
              setMode={setMiddleMode}
              state={state}
              toolHighlight={toolHighlight}
              setToolHighlight={setToolHighlight}
              fsStyle={tweaks.fsStyle}
              journalRich={tweaks.journalRich}
              lastOpTs={lastOpTs}
            />
            <RightColumn
              mode={tweaks.rightMode}
              setMode={setRightMode}
              state={state}
              liveMeta={liveEnabled ? liveMeta : undefined}
            />
          </>
        ) : (
          <ExperimentalCanvas
            state={state}
            setState={setState}
            running={running}
            tweaks={tweaks}
            setTweaks={setTweaks}
            toolHighlight={toolHighlight}
            setToolHighlight={setToolHighlight}
            lastOpTs={lastOpTs}
          />
        )}
        <Dock state={state} />
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
        playing={playing}
        setPlaying={setPlaying}
      />

      {/* Floating button to open tweaks (replaces the prototype's edit-mode
          activation via window.parent.postMessage). */}
      <button
        type="button"
        aria-label="Open tweaks panel"
        onClick={() => setTweaksOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 70,
          width: 36,
          height: 36,
          borderRadius: 9999,
          border: "1px solid var(--ag-border-default)",
          background: "color-mix(in oklab, var(--ag-bg-surface) 80%, transparent)",
          backdropFilter: "blur(20px) saturate(1.4) brightness(1.05)",
          color: "var(--ag-text-primary)",
          fontFamily: "var(--ag-font-mono)",
          fontSize: 14,
          cursor: "pointer",
          boxShadow: "var(--ag-shadow-lg)",
        }}
      >
        ⚙
      </button>
    </div>
  );
}
