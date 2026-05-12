"use client";

interface Props {
  onClose: () => void;
}

/**
 * Brief identity popover. Renders a static Anima card — the AnimaPane on the
 * right column is the full, live-data view. This popover exists purely so
 * the top-left Anima badge has a lightweight overlay for quick reference
 * without changing the user's right-pane selection.
 */
export function AnimaPopover({ onClose }: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Anima popover"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "transparent",
          border: 0,
          cursor: "default",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 58,
          left: 16,
          width: 340,
          maxWidth: "calc(100vw - 32px)",
          zIndex: 51,
          padding: 16,
          border: "1px solid var(--ag-border-default)",
          borderRadius: 14,
          background:
            "color-mix(in oklab, var(--ag-bg-surface) 78%, transparent)",
          backdropFilter: "blur(20px) saturate(1.4) brightness(1.05)",
          boxShadow:
            "inset 0 1px 0 oklch(1 0 0 / 0.06), var(--ag-shadow-xl)",
        }}
      >
        <div className="row" style={{ gap: 12, marginBottom: 12 }}>
          <div className="anima-avatar" style={{ width: 46, height: 46 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{ fontFamily: "var(--ag-font-heading)", fontSize: 16 }}
            >
              Anima
            </div>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "var(--ag-text-muted)" }}
            >
              Identity substrate
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--ag-text-secondary)",
          }}
        >
          Anima holds the session soul: your identity, tier, DID, beliefs,
          and trust vector. Open the <strong>Anima</strong> tab in the right
          column for the full view with live session data.
        </div>
      </div>
    </>
  );
}
