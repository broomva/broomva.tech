"use client";

import type { LifeUserIdentity } from "./AnimaPane";

interface Props {
  setAnimaOpen: (next: (v: boolean) => boolean) => void;
  crumb: { brand: string; project: string };
  /** Authed / anon identity — drives the badge's name + soul. */
  user?: LifeUserIdentity;
  projectSlug?: string;
  /** Mobile-only: open the pane tweaks sheet from the header. */
  onOpenPreferences?: () => void;
}

export function Topbar({
  setAnimaOpen,
  crumb,
  user,
  projectSlug,
  onOpenPreferences,
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
          <span className="topbar__crumb-project">{crumb.project}</span>
        </div>
      </div>
      <div className="topbar__right">
        {onOpenPreferences && (
          <button
            type="button"
            className="btn btn--ghost btn--icon topbar__prefs-btn"
            onClick={onOpenPreferences}
            aria-label="Pane preferences"
            title="Pane preferences"
          >
            ⚙
          </button>
        )}
      </div>
    </div>
  );
}
