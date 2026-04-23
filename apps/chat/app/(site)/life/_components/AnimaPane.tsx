"use client";

import { LIFE_ANIMA } from "../_lib/mock-workspace";
import type { LiveRunMeta } from "../_lib/use-live-run";

export interface LifeUserIdentity {
  /** Authed user id, or anon-session id, or "anonymous" for no-cookie guests. */
  id: string;
  /** Kind: "user" | "anon" | "agent" (x402 wallet). */
  kind: "user" | "anon" | "agent";
  /** Display name — email local part for authed, "Guest" otherwise. */
  name: string;
  /** Human-readable handle. */
  handle?: string;
  /** Email if authed. */
  email?: string;
}

interface Props {
  /** Authed / anon / agent identity threaded from the server page. */
  user?: LifeUserIdentity;
  /** Project slug to personalize the soul. */
  projectSlug?: string;
  /** Present when live-streaming is active. */
  liveMeta?: LiveRunMeta;
}

function tierFor(kind: LifeUserIdentity["kind"] | undefined): string {
  if (kind === "user") return "sovereign";
  if (kind === "agent") return "x402";
  return "guest";
}

function deriveSoul(user: LifeUserIdentity | undefined, projectSlug?: string) {
  if (!user) return LIFE_ANIMA;
  const handle = user.handle ?? user.name.toLowerCase().replace(/\s+/g, "-");
  return {
    name: user.name,
    soul: `soul:life.${handle}.${projectSlug ?? "broomva"}`,
    tier: tierFor(user.kind),
    did: `did:life:${user.id.slice(0, 22)}${user.id.length > 22 ? "…" : ""}`,
    beliefs:
      user.kind === "user"
        ? [
            `${user.name} is the authenticated principal for this run.`,
            "Every action produces an immutable trace in LifeRunEvent.",
            "Payments settle through Haima; x402 for external callers.",
          ]
        : [
            "Guest session — no authenticated principal.",
            "Runs are attributed to an anonymous cookie id.",
            "Sign in to persist memory across sessions and unlock pro tier.",
          ],
    trust:
      user.kind === "user"
        ? { user: 0.92, workspace: 0.78, peers: 0.71 }
        : { user: 0.4, workspace: 0.3, peers: 0.5 },
    session: liveRunIdShort(liveMeta(undefined)),
  };
}

function liveMeta(_x: undefined): string {
  return "—";
}

export function AnimaPane({ user, projectSlug, liveMeta: live }: Props) {
  const isLive = !!live;
  const a = isLive ? deriveSoul(user, projectSlug) : LIFE_ANIMA;
  // Override session from live run id if present.
  const sessionLabel =
    live?.sessionId?.slice(0, 8) ??
    live?.runId?.slice(0, 8) ??
    (isLive ? "idle" : a.session);

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 10 }}
      >
        <div className="eyebrow">Anima · identity</div>
        <span className={`pill ${isLive ? "pill--accent" : ""}`}>
          {isLive ? `live · ${a.tier}` : `demo · ${a.tier}`}
        </span>
      </div>
      <div
        className="gauge"
        style={{ display: "flex", gap: 12, alignItems: "center" }}
      >
        <div className="anima-avatar" style={{ width: 54, height: 54 }} />
        <div>
          <div style={{ fontFamily: "var(--ag-font-heading)", fontSize: 18 }}>
            {a.name}
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 10.5,
              color: "var(--ag-text-muted)",
            }}
          >
            {a.soul}
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 10.5,
              color: "var(--ag-text-muted)",
            }}
          >
            {a.did}
          </div>
        </div>
      </div>
      <div className="gauge" style={{ marginTop: 10 }}>
        <div className="gauge__label">Session</div>
        <div
          className="gauge__value"
          style={{ fontSize: 14, fontFamily: "var(--ag-font-mono)" }}
        >
          {sessionLabel}
        </div>
        <div className="gauge__sub">
          {isLive
            ? user?.email
              ? `authed · ${user.email}`
              : user?.kind === "anon"
                ? "anon cookie"
                : "no cookie · x402 eligible"
            : "demo session"}
        </div>
      </div>
      <div className="section">Beliefs (active)</div>
      {a.beliefs.map((b) => (
        <div
          key={b}
          className="judge-card"
          style={{ fontSize: 12, marginTop: 6 }}
        >
          <div style={{ color: "var(--ag-text-primary)", lineHeight: 1.55 }}>
            {b}
          </div>
        </div>
      ))}
      <div className="section">Trust vector</div>
      {Object.entries(a.trust).map(([k, v]) => (
        <div className="judge-card" key={k} style={{ marginTop: 6 }}>
          <div className="judge-card__head">
            <div
              style={{
                fontFamily: "var(--ag-font-mono)",
                fontSize: 11.5,
                color: "var(--ag-text-secondary)",
              }}
            >
              {k}
            </div>
            <div
              style={{ fontFamily: "var(--ag-font-heading)", fontSize: 14 }}
            >
              {v.toFixed(2)}
            </div>
          </div>
          <div className="bar">
            <div
              className="bar__fill"
              style={{ width: `${v * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function liveRunIdShort(x: string | undefined): string {
  return x ?? "—";
}
