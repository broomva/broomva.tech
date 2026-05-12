"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ContextSidebarState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const ContextSidebarContext = createContext<ContextSidebarState | null>(null);

export function ContextSidebarProvider({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle]
  );

  return (
    <ContextSidebarContext.Provider value={value}>
      {children}
    </ContextSidebarContext.Provider>
  );
}

export function useContextSidebar() {
  const context = useContext(ContextSidebarContext);
  if (!context) {
    throw new Error(
      "useContextSidebar must be used within a ContextSidebarProvider"
    );
  }
  return context;
}
