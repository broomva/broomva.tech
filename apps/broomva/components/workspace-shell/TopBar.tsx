import { StatusPill } from "./StatusPill";

/**
 * Workspace top bar — brand mark, breadcrumb, status pills, ⌘K hint, avatar.
 *
 * Sandbox + Agent pills make the runtime visible (sandbox status sourced from
 * Vigil/process metrics pre-Soma; agent liveness from session event tail).
 * Status indicators are static placeholders in v1 — wired in PR 4 (Session
 * lens) when the lifegw client is consumed.
 */
export function TopBar() {
  return (
    <header className="flex items-center gap-3 border-b border-[color:var(--ag-border-subtle)] px-4 text-[12px]">
      <span
        aria-hidden
        className="h-4 w-4 rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--ag-ai-blue) 0%, transparent 70%)",
        }}
      />
      <span className="font-mono">
        broomva<span className="opacity-50"> / workspace</span>
      </span>
      <span className="opacity-40">·</span>
      <span className="font-mono opacity-70">personal</span>
      <span className="opacity-40">·</span>
      <span className="font-mono opacity-70">session</span>

      <div className="flex-1" />

      <StatusPill label="Sandbox status">
        <span className="opacity-60">sandbox</span>
        <span>iad · 0% cpu</span>
      </StatusPill>
      <StatusPill label="Agent status" dotColor="var(--ag-ai-blue)">
        <span className="opacity-60">resident</span>
        <span>idle</span>
      </StatusPill>

      <span className="ag-glass-subtle rounded-md px-2 py-1 font-mono text-[10px] opacity-60">
        ⌘K
      </span>
      <div
        role="img"
        aria-label="User avatar"
        className="h-5 w-5 rounded-full"
        style={{
          background:
            "linear-gradient(135deg, var(--ag-ai-blue), var(--ag-accent-blue, var(--ag-ai-blue)))",
        }}
      />
    </header>
  );
}
