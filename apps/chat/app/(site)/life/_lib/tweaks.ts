// Tweaks defaults + localStorage persistence (no postMessage / sandbox coupling).
// Replaces the prototype's window.parent.postMessage edit-mode wiring with a
// safe SSR-friendly localStorage strategy. Keys are namespaced to avoid
// collisions with other broomva.tech surfaces.

import type {
  FsStyle,
  LayoutMode,
  MetricsDensity,
  MiddleMode,
  RightMode,
  ScenarioId,
  TweaksState,
} from "./types";

export const TWEAKS_STORAGE_KEY = "life.tweaks.v1";

export const DEFAULT_TWEAKS: TweaksState = {
  layout: "classic",
  middleMode: "files",
  rightMode: "preview",
  fsStyle: "heartbeat",
  journalRich: false,
  metricsDensity: "rich",
  orbs: true,
  scenario: "refactor",
  autoplay: true,
};

const LAYOUTS: LayoutMode[] = ["classic", "experimental"];
const MIDDLE: MiddleMode[] = ["files", "journal", "timeline", "graph", "spaces"];
const RIGHT: RightMode[] = [
  "preview",
  "vigil",
  "nous",
  "autonomic",
  "haima",
  "anima",
];
const FS: FsStyle[] = ["finder", "shimmer", "heartbeat", "ticker"];
const DENSITY: MetricsDensity[] = ["minimal", "medium", "rich"];
const SCENARIOS: ScenarioId[] = ["refactor", "ingest", "research", "materiales"];

function pick<T>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function readTweaks(): TweaksState {
  if (typeof window === "undefined") return DEFAULT_TWEAKS;
  try {
    const raw = window.localStorage.getItem(TWEAKS_STORAGE_KEY);
    if (!raw) return DEFAULT_TWEAKS;
    const parsed = JSON.parse(raw) as Partial<TweaksState>;
    return {
      layout: pick(LAYOUTS, parsed.layout, DEFAULT_TWEAKS.layout),
      middleMode: pick(MIDDLE, parsed.middleMode, DEFAULT_TWEAKS.middleMode),
      rightMode: pick(RIGHT, parsed.rightMode, DEFAULT_TWEAKS.rightMode),
      fsStyle: pick(FS, parsed.fsStyle, DEFAULT_TWEAKS.fsStyle),
      journalRich:
        typeof parsed.journalRich === "boolean"
          ? parsed.journalRich
          : DEFAULT_TWEAKS.journalRich,
      metricsDensity: pick(
        DENSITY,
        parsed.metricsDensity,
        DEFAULT_TWEAKS.metricsDensity,
      ),
      orbs: typeof parsed.orbs === "boolean" ? parsed.orbs : DEFAULT_TWEAKS.orbs,
      scenario: pick(SCENARIOS, parsed.scenario, DEFAULT_TWEAKS.scenario),
      autoplay:
        typeof parsed.autoplay === "boolean"
          ? parsed.autoplay
          : DEFAULT_TWEAKS.autoplay,
    };
  } catch {
    return DEFAULT_TWEAKS;
  }
}

export function writeTweaks(tweaks: TweaksState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(tweaks));
  } catch {
    // Quota exceeded / private mode — silently degrade.
  }
}
