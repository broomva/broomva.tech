"use client";

import type { TweaksState } from "../_lib/types";
import type { LifeUserIdentity } from "./AnimaPane";

interface Props {
  setAnimaOpen: (next: (v: boolean) => boolean) => void;
  tweaks: TweaksState;
  setTweaks: (patch: Partial<TweaksState>) => void;
  playing: boolean;
  setPlaying: (next: boolean | ((p: boolean) => boolean)) => void;
  crumb: { brand: string; project: string; scenarioLabel: string };
  /** Authed / anon identity — drives the badge's name + soul. */
  user?: LifeUserIdentity;
  projectSlug?: string;
}

export function Topbar({
  setAnimaOpen,
  tweaks,
  setTweaks,
  playing,
  setPlaying,
  crumb,
  user,
  projectSlug,
}: Props) {
  const badgeName = user?.name ?? "Arcan";
  const badgeHandle = user?.handle ?? user?.email?.split("@")[0] ?? "arcan";
  const badgeSoul = `soul:life.${badgeHandle}.${projectSlug ?? "broomva"}`;
  return (
    <div className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="anima-badge"
          onClick={() => setAnimaOpen((v) => !v)}
          title="Anima · identity"
        >
          <div className="anima-avatar" />
          <div>
            <div className="anima-name">{badgeName}</div>
            <div className="anima-soul">{badgeSoul}</div>
          </div>
        </button>
        <div className="topbar__crumb">
          <strong>{crumb.brand}</strong>
          <span className="sep">/</span>
          life
          <span className="sep">/</span>
          {crumb.project}
          <span className="sep">·</span>
          {crumb.scenarioLabel}
        </div>
      </div>
      <div className="topbar__right">
        <button
          type="button"
          className="btn"
          onClick={() => setTweaks({ scenario: "refactor" })}
          style={{ opacity: tweaks.scenario === "refactor" ? 1 : 0.6 }}
        >
          Refactor
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setTweaks({ scenario: "ingest" })}
          style={{ opacity: tweaks.scenario === "ingest" ? 1 : 0.6 }}
        >
          Ingest
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setTweaks({ scenario: "research" })}
          style={{ opacity: tweaks.scenario === "research" ? 1 : 0.6 }}
        >
          Research
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setTweaks({ scenario: "materiales" })}
          style={{ opacity: tweaks.scenario === "materiales" ? 1 : 0.6 }}
        >
          Materiales
        </button>
        <span
          style={{
            width: 1,
            height: 20,
            background: "var(--ag-border-subtle)",
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            setTweaks({
              layout: tweaks.layout === "classic" ? "experimental" : "classic",
            })
          }
        >
          {tweaks.layout === "classic" ? "Experimental" : "Classic"}
        </button>
      </div>
    </div>
  );
}
