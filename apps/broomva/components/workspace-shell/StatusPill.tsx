import type { ReactNode } from "react";

interface StatusPillProps {
  /** Accessible label (announced to screen readers, used by tests). */
  label: string;
  /** CSS color for the leading dot. Defaults to success green. */
  dotColor?: string;
  children: ReactNode;
}

/**
 * Top-bar status indicator. One pill = one live signal (sandbox metrics,
 * agent awakeness, etc.). The leading dot conveys state via color.
 */
export function StatusPill({
  label,
  dotColor = "var(--ag-success, oklch(0.72 0.19 155))",
  children,
}: StatusPillProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className="ag-glass-subtle inline-flex items-center gap-2 rounded-md px-2.5 py-1 font-mono text-[11px]"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      {children}
    </span>
  );
}
