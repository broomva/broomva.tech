"use client";

import type { TweaksState } from "../_lib/types";

interface Props {
  tweaks: TweaksState;
  setTweaks: (patch: Partial<TweaksState>) => void;
  open: boolean;
  onClose: () => void;
}

interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: [V, string][];
  onChange: (value: V) => void;
  wrap?: boolean;
}

function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  wrap,
}: SegmentedProps<V>) {
  return (
    <div className="tweaks__row">
      <div className="tweaks__label">{label}</div>
      <div
        className="segmented"
        style={wrap ? { flexWrap: "wrap", gap: 2 } : {}}
      >
        {options.map(([v, l]) => (
          <button
            type="button"
            key={v}
            className={value === v ? "is-active" : ""}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TweaksPanel({ tweaks, setTweaks, open, onClose }: Props) {
  return (
    <div className={`tweaks ${open ? "is-open" : ""}`}>
      <div className="tweaks__head">
        <div className="tweaks__title">Preferences</div>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onClose}
          aria-label="Close preferences"
        >
          ✕
        </button>
      </div>
      <Segmented
        label="Middle pane"
        value={tweaks.middleMode}
        options={[
          ["files", "Files"],
          ["journal", "Journal"],
          ["timeline", "Timeline"],
          ["graph", "Graph"],
          ["spaces", "Spaces"],
        ]}
        onChange={(v) => setTweaks({ middleMode: v })}
        wrap
      />
      <Segmented
        label="Right pane"
        value={tweaks.rightMode}
        options={[
          ["preview", "Preview"],
          ["vigil", "Vigil"],
          ["nous", "Nous"],
          ["autonomic", "Autonomic"],
          ["haima", "Haima"],
          ["anima", "Anima"],
        ]}
        onChange={(v) => setTweaks({ rightMode: v })}
        wrap
      />
      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid var(--ag-border-subtle)",
          color: "var(--ag-text-muted)",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        Your pane preferences are saved in this browser. They apply to every{" "}
        <code>/life/&lt;project&gt;</code> session you open.
      </div>
    </div>
  );
}
