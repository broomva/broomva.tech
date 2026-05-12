"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToolbarDockPayload = {
  html: string;
  title: string;
  summary: string;
  slug: string;
  audioSrc?: string;
};

type ToolbarDockContextValue = {
  isDocked: boolean;
  payload: ToolbarDockPayload | null;
  setDocked: (docked: boolean, payload?: ToolbarDockPayload) => void;
};

const ToolbarDockContext = createContext<ToolbarDockContextValue>({
  isDocked: false,
  payload: null,
  setDocked: () => {},
});

export function ToolbarDockProvider({ children }: { children: ReactNode }) {
  const [isDocked, setIsDocked] = useState(false);
  const [payload, setPayload] = useState<ToolbarDockPayload | null>(null);

  const setDocked = useCallback(
    (docked: boolean, p?: ToolbarDockPayload) => {
      setIsDocked(docked);
      if (p) setPayload(p);
      if (!docked) setPayload(null);
    },
    [],
  );

  const value = useMemo(
    () => ({ isDocked, payload, setDocked }),
    [isDocked, payload, setDocked],
  );

  return (
    <ToolbarDockContext.Provider value={value}>
      {children}
    </ToolbarDockContext.Provider>
  );
}

export function useToolbarDock() {
  return useContext(ToolbarDockContext);
}
