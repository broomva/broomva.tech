// Tweaks defaults + localStorage persistence. Scoped to production knobs:
// which middle pane + right pane the user prefers. Everything else has been
// removed along with the prototype's scenario / experimental layout surface.

import type { MiddleMode, RightMode, TweaksState } from "./types";

export const TWEAKS_STORAGE_KEY = "life.tweaks.v2";

export const DEFAULT_TWEAKS: TweaksState = {
  middleMode: "files",
  rightMode: "vigil",
};

const MIDDLE: MiddleMode[] = [
  "files",
  "journal",
  "timeline",
  "graph",
  "spaces",
];
const RIGHT: RightMode[] = [
  "preview",
  "vigil",
  "nous",
  "autonomic",
  "haima",
  "anima",
];

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
      middleMode: pick(MIDDLE, parsed.middleMode, DEFAULT_TWEAKS.middleMode),
      rightMode: pick(RIGHT, parsed.rightMode, DEFAULT_TWEAKS.rightMode),
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
