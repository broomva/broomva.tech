"use client";

/**
 * RelayShell — three-panel flexbox wrapper for the relay console.
 *
 * Negates the console layout's padding to create a full-bleed layout
 * within the SidebarInset. Children are expected to be:
 *   1. RelayLeftPanel  (w-64, shrink-0, border-r)
 *   2. Center content  (flex-1, min-w-0)
 *   3. RelayRightPanel (w-72, shrink-0, border-l)
 */

export function RelayShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="-mx-4 -mt-4 -mb-24 flex overflow-hidden"
      style={{ height: "calc(100dvh - 3.5rem)" }}
    >
      {children}
    </div>
  );
}
