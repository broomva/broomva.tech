interface LensDef {
  id: "session" | "files" | "memory" | "operations" | "agents" | "policy";
  label: string;
  glyph: string;
  v1: boolean;
}

const LENSES: readonly LensDef[] = [
  { id: "session", label: "Session lens", glyph: "⌂", v1: true },
  { id: "files", label: "Files lens", glyph: "▦", v1: true },
  { id: "memory", label: "Memory lens", glyph: "✦", v1: false },
  { id: "operations", label: "Operations lens", glyph: "⊟", v1: false },
  { id: "agents", label: "Agents lens", glyph: "◉", v1: true },
  { id: "policy", label: "Policy lens", glyph: "❖", v1: false },
];

/**
 * Bottom dock — six lens icons + new + settings.
 *
 * v1.1 lenses (Memory, Operations, Policy) render disabled with a
 * "coming in v1.1" tooltip — the dock teaches the user what the OS *will*
 * be rather than hiding it.
 */
export function Dock() {
  return (
    <nav
      aria-label="Workspace dock"
      className="ag-glass-subtle flex items-center justify-center gap-1 border-t border-[color:var(--ag-border-subtle)]"
    >
      {LENSES.map((l) => (
        <button
          key={l.id}
          type="button"
          aria-label={l.label}
          disabled={!l.v1}
          title={l.v1 ? l.label : `${l.label} — coming in v1.1`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[14px] hover:bg-[color:var(--ag-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {l.glyph}
        </button>
      ))}
      <span
        aria-hidden
        className="mx-1 h-4 w-px bg-[color:var(--ag-border-default,var(--ag-border-subtle))]"
      />
      <button
        type="button"
        aria-label="New"
        className="h-8 w-8 rounded-md hover:bg-[color:var(--ag-bg-hover)]"
      >
        +
      </button>
      <button
        type="button"
        aria-label="Settings"
        className="h-8 w-8 rounded-md hover:bg-[color:var(--ag-bg-hover)]"
      >
        ⚙
      </button>
    </nav>
  );
}
