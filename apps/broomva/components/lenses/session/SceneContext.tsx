"use client";

import type { ProsoponEvent, Scene } from "@broomva/prosopon";
import { createContext, useContext } from "react";
import { EMPTY_SCENE } from "./useSessionStream";

export interface SceneContextValue {
  scene: Scene;
  /** Apply a single envelope to the scene. */
  dispatch: (event: ProsoponEvent) => void;
  /** True while the SSE connection is live. */
  connected: boolean;
  /** Last applied sequence cursor; mirrored to URL hash. */
  lastSeq: bigint;
}

const SceneContext = createContext<SceneContextValue | null>(null);

export const SceneContextProvider = SceneContext.Provider;

export function useSceneContext(): SceneContextValue {
  const ctx = useContext(SceneContext);
  if (!ctx) {
    throw new Error("useSceneContext must be inside <SceneContextProvider>");
  }
  return ctx;
}

const FALLBACK_SCENE_CONTEXT: SceneContextValue = {
  scene: EMPTY_SCENE,
  dispatch: () => {},
  connected: false,
  lastSeq: 0n,
};

/**
 * Like useSceneContext but returns a safe default (empty scene, disconnected)
 * when no provider is mounted. Use this in right-rail panels that may be
 * rendered outside a session route (e.g. on /workspace landing).
 */
export function useSceneContextOptional(): SceneContextValue {
  const ctx = useContext(SceneContext);
  return ctx ?? FALLBACK_SCENE_CONTEXT;
}
