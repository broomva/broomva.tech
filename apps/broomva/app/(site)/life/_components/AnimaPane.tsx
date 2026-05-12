"use client";

import type { ProsoponRunMeta } from "../_lib/use-prosopon-run";

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
  user?: LifeUserIdentity;
  projectSlug?: string;
  liveMeta?: ProsoponRunMeta;
}

function tierFor(kind: LifeUserIdentity["kind"] | undefined): string {
  if (kind === "user") return "sovereign";
  if (kind === "agent") return "x402";
  return "guest";
}

interface AnimaSoul {
  name: string;
  soul: string;
  tier: string;
  did: string;
  beliefs: string[];
  trust: Record<string, number>;
}

function deriveSoul(
  user: LifeUserIdentity | undefined,
  projectSlug: string | undefined,
): AnimaSoul {
  const name = user?.name ?? "Guest";
  const handle =
    user?.handle ?? name.toLowerCase().replace(/\s+/g, "-");
  const kind = user?.kind ?? "anon";
  const id = user?.id ?? "anonymous";
  return {
    name,
    soul: `soul:life.${handle}.${projectSlug ?? "broomva"}`,
    tier: tierFor(kind),
    did: `did:life:${id.slice(0, 22)}${id.length > 22 ? "…" : ""}`,
    beliefs:
      kind === "user"
        ? [
            `${name} is the authenticated principal for this run.`,
            "Every action produces an immutable trace in LifeRunEvent.",
            "Payments settle through Haima; x402 for external callers.",
          ]
        : [
            "Guest session — no authenticated principal.",
            "Runs are attributed to an anonymous cookie id.",
            "Sign in to persist memory across sessions and unlock pro tier.",
          ],
    trust:
      kind === "user"
        ? { user: 0.92, workspace: 0.78, peers: 0.71 }
        : { user: 0.4, workspace: 0.3, peers: 0.5 },
  };
}

export function AnimaPane({ user, projectSlug, liveMeta }: Props) {
  const a = deriveSoul(user, projectSlug);
  const sessionLabel =
    liveMeta?.sessionId?.slice(0, 8) ??
    liveMeta?.runId?.slice(0, 8) ??
    "idle";

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 10 }}
      >
        <div className="eyebrow">Anima · identity</div>
        <span className="pill pill--accent">live · {a.tier}</span>
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
          {user?.email
            ? `authed · ${user.email}`
            : user?.kind === "anon"
              ? "anon cookie"
              : "no cookie · x402 eligible"}
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
