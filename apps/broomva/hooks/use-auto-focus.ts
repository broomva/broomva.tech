"use client";

import type { LexicalEditor } from "lexical";
import { useEffect } from "react";

export function useAutoFocus({
  autoFocus,
  editor,
}: {
  autoFocus: boolean;
  editor: LexicalEditor | null;
}) {
  useEffect(() => {
    if (!(autoFocus && editor)) {
      return;
    }

    // Avoid stealing focus (e.g. user clicked a modal / another input during hydration).
    const active = document.activeElement;
    if (active && active !== document.body) {
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      editor.focus();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [autoFocus, editor]);
}
