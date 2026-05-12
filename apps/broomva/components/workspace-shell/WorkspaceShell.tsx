"use client";

import type { ReactNode } from "react";
import { CmdPalette } from "./CmdPalette";
import { Dock } from "./Dock";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";
import { TopBar } from "./TopBar";

interface WorkspaceShellProps {
  children: ReactNode;
}

/**
 * The workspace shell — top bar + (left rail · center · right rail) + dock.
 *
 * The center stage hosts the active lens via {children}. ⌘K palette is
 * mounted at the shell so its keyboard handler is always live.
 *
 * Per docs/superpowers/specs/2026-05-11-broomva-ai-os-design.md §5.
 */
export function WorkspaceShell({ children }: WorkspaceShellProps) {
  return (
    <div
      className="grid h-screen w-screen"
      style={{
        gridTemplateRows: "44px 1fr 46px",
        background: "var(--ag-bg-deep)",
        color: "var(--ag-text-primary, white)",
      }}
    >
      <TopBar />
      <div
        className="grid"
        style={{ gridTemplateColumns: "270px 1fr 320px", minHeight: 0 }}
      >
        <LeftRail />
        <main aria-label="Center stage" className="overflow-y-auto">
          {children}
        </main>
        <RightRail />
      </div>
      <Dock />
      <CmdPalette />
    </div>
  );
}
