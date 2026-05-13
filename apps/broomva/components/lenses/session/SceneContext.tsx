"use client";

import type { ProsoponEvent, Scene } from "@broomva/prosopon";
import { createContext, useContext } from "react";

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
