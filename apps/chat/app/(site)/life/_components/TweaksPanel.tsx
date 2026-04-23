"use client";

import type { TweaksState } from "../_lib/types";

interface Props {
  tweaks: TweaksState;
  setTweaks: (patch: Partial<TweaksState>) => void;
  open: boolean;
  onClose: () => void;
  playing: boolean;
  setPlaying: (next: boolean | ((p: boolean) => boolean)) => void;
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

export function TweaksPanel({
  tweaks,
  setTweaks,
  open,
  onClose,
  playing,
  setPlaying,
}: Props) {
  return (
    <div className={`tweaks ${open ? "is-open" : ""}`}>
      <div className="tweaks__head">
        <div className="tweaks__title">Tweaks</div>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <Segmented
        label="Layout"
        value={tweaks.layout}
        options={[
          ["classic", "Classic"],
          ["experimental", "Experimental"],
        ]}
        onChange={(v) => setTweaks({ layout: v })}
      />
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
      <Segmented
        label="Filesystem feel"
        value={tweaks.fsStyle}
        options={[
          ["finder", "Finder"],
          ["shimmer", "Shimmer"],
          ["heartbeat", "Heartbeat"],
          ["ticker", "Ticker"],
        ]}
        onChange={(v) => setTweaks({ fsStyle: v })}
      />
      <Segmented
        label="Journal depth"
        value={tweaks.journalRich ? "rich" : "compact"}
        options={[
          ["compact", "Compact"],
          ["rich", "Rich"],
        ]}
        onChange={(v) => setTweaks({ journalRich: v === "rich" })}
      />
      <Segmented
        label="Metrics density"
        value={tweaks.metricsDensity}
        options={[
          ["minimal", "Min"],
          ["medium", "Med"],
          ["rich", "Rich"],
        ]}
        onChange={(v) => setTweaks({ metricsDensity: v })}
      />
      <Segmented
        label="Scenario"
        value={tweaks.scenario}
        options={[
          ["refactor", "Refactor"],
          ["ingest", "Ingest"],
          ["research", "Research"],
        ]}
        onChange={(v) => setTweaks({ scenario: v })}
      />

      <div
        className="tweaks__row"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
        }}
      >
        <button
          type="button"
          className={`switch ${tweaks.orbs ? "is-on" : ""}`}
          onClick={() => setTweaks({ orbs: !tweaks.orbs })}
          style={{ background: "transparent", border: 0, padding: 0 }}
        >
          <div className="switch__track" />
          <div className="switch__label">Atmospheric orbs</div>
        </button>
      </div>
      <div
        className="tweaks__row"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          className={`switch ${tweaks.autoplay ? "is-on" : ""}`}
          onClick={() => setTweaks({ autoplay: !tweaks.autoplay })}
          style={{ background: "transparent", border: 0, padding: 0 }}
        >
          <div className="switch__track" />
          <div className="switch__label">Autoplay scenario</div>
        </button>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setPlaying((p) => !p)}
          style={{ flex: 1 }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setPlaying(false);
            setTimeout(() => setPlaying(true), 50);
            setTweaks({ scenario: tweaks.scenario });
          }}
          style={{ flex: 1 }}
        >
          Replay
        </button>
      </div>
    </div>
  );
}
