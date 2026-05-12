import type { Metadata } from "next";
import Link from "next/link";
import { PROJECTS, type ProjectChipColor } from "./_lib/project-map";

const CHIP_LABELS: Record<ProjectChipColor, string> = {
  emerald: "live",
  amber: "research",
  violet: "paid",
  blue: "preview",
  rose: "alpha",
};

export const metadata: Metadata = {
  title: "Life · An Operating System for AI Agents",
  description:
    "Identity, memory, custody, payments, and execution as primitives — not bolt-ons. Rust-native, event-sourced, MIT licensed. Spec D 100% complete (May 2, 2026).",
  openGraph: {
    title: "Life — Agent Operating System",
    description:
      "An operating system for AI agents. 8 subsystems on one kernel contract. Production custody (6 backends), event-sourced persistence, native finance, cryptographic identity.",
    type: "website",
  },
};

// 8 subsystems on one kernel contract (aiOS). Each card answers
// "what role does this play in the agent lifecycle" in one line.
const SUBSYSTEMS: ReadonlyArray<{
  name: string;
  role: string;
  description: string;
  hash: string;
}> = [
  {
    name: "Anima",
    role: "Identity",
    description:
      "Soul, dual keypair (P-256 auth + secp256k1 wallet), DID, custody trait with 6 backends.",
    hash: "#anima",
  },
  {
    name: "Arcan",
    role: "Runtime",
    description:
      "Agent loop — reconstruct from journal, call provider, execute tools, stream events.",
    hash: "#arcan",
  },
  {
    name: "Lago",
    role: "Persistence",
    description:
      "Append-only event journal, content-addressed blobs, knowledge index, multi-format SSE.",
    hash: "#lago",
  },
  {
    name: "Haima",
    role: "Finance",
    description:
      "x402 machine-payments, secp256k1 wallets, per-task billing, on-chain settlement.",
    hash: "#haima",
  },
  {
    name: "Autonomic",
    role: "Homeostasis",
    description:
      "Three-pillar regulation — operational, cognitive, economic. Hysteresis anti-flapping.",
    hash: "#autonomic",
  },
  {
    name: "Praxis",
    role: "Tools",
    description:
      "Sandbox, hashline editing (Blake3), SKILL.md registry, MCP server + client bridge.",
    hash: "#praxis",
  },
  {
    name: "Vigil",
    role: "Observability",
    description:
      "OpenTelemetry tracing, GenAI semantic conventions, contract-derived spans.",
    hash: "#vigil",
  },
  {
    name: "Spaces",
    role: "Networking",
    description:
      "SpacetimeDB 2.0 fabric, real-time agent communication, RBAC channels.",
    hash: "#spaces",
  },
];

// Spec D ships custody as a first-class trait with 6 backends.
// Each card maps to one of L4-D5..D10's locked decisions.
const CUSTODY_BACKENDS: ReadonlyArray<{
  name: string;
  surface: string;
  desc: string;
}> = [
  {
    name: "InProcessAnima",
    surface: "Dev / single-host",
    desc: "Master seed → P-256 auth + secp256k1 wallet, ChaCha20-Poly1305 at rest.",
  },
  {
    name: "VaultTransitAnima",
    surface: "Server-side",
    desc: "HashiCorp Vault Transit — keys never leave the KMS. Per-user namespaces.",
  },
  {
    name: "TpmAnima",
    surface: "Desktop",
    desc: "PKCS#11 against the host TPM. Auth-key never reveals the scalar.",
  },
  {
    name: "WebCryptoAnima",
    surface: "Browser",
    desc: "Passkey-managed, non-extractable. Wallet ops delegated to RemoteAnima.",
  },
  {
    name: "HardwareWalletAnima",
    surface: "High-stakes",
    desc: "Ledger over hidapi. Every wallet op is hardware-confirmed.",
  },
  {
    name: "SomaCustody",
    surface: "Multi-tenant",
    desc: "soma admin custody-oracle UDS. SO_PEERCRED + group-based authn.",
  },
];

const PROJECT_ENTRIES = Object.entries(PROJECTS);

export default function LifeLandingPage() {
  return (
    <div className="life-landing">
      <div className="life-landing__inner">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="life-landing__hero">
          <div className="life-landing__eyebrow">
            <span className="life-landing__pulse" aria-hidden="true" />
            Spec D · 100% complete · May 2, 2026
          </div>

          <h1 className="life-landing__title">
            An operating system <br className="life-landing__br" />
            for AI agents.
          </h1>

          <p className="life-landing__sub">
            Identity, memory, custody, payments, and execution &mdash;
            primitives, not bolt-ons. Rust-native, event-sourced, MIT licensed.
          </p>

          <div className="life-landing__cta-row">
            <a
              className="life-landing__cta life-landing__cta--primary"
              href="https://github.com/broomva/life"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
            <Link
              className="life-landing__cta life-landing__cta--ghost"
              href="/launch/life"
            >
              Read the longform pitch
            </Link>
            <a
              className="life-landing__cta life-landing__cta--ghost"
              href="https://crates.io/crates/arcan"
              target="_blank"
              rel="noopener noreferrer"
            >
              cargo install arcan
            </a>
          </div>

          <dl className="life-landing__stat-strip">
            <div className="life-landing__stat">
              <dt>Rust tests</dt>
              <dd>4,133+</dd>
            </div>
            <div className="life-landing__stat">
              <dt>Subsystems</dt>
              <dd>8</dd>
            </div>
            <div className="life-landing__stat">
              <dt>Custody backends</dt>
              <dd>6 / 6</dd>
            </div>
            <div className="life-landing__stat">
              <dt>License</dt>
              <dd>MIT</dd>
            </div>
          </dl>
        </section>

        {/* ── What's inside ────────────────────────────────────────── */}
        <section className="life-landing__section">
          <header className="life-landing__section-head">
            <p className="life-landing__kicker">The substrate</p>
            <h2 className="life-landing__h2">Eight subsystems, one kernel contract.</h2>
            <p className="life-landing__lede">
              Every subsystem implements traits from <code>aios-protocol</code>{" "}
              &mdash; the contract that defines events, state, policy, and the
              agent lifecycle. Swap or extend any part without breaking the rest.
            </p>
          </header>

          <ul className="life-landing__sub-grid">
            {SUBSYSTEMS.map((s) => (
              <li
                key={s.name}
                id={s.hash.slice(1)}
                className="life-landing__sub-card"
              >
                <p className="life-landing__sub-name">
                  {s.name}{" "}
                  <span className="life-landing__sub-role">{s.role}</span>
                </p>
                <p className="life-landing__sub-desc">{s.description}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── What just shipped (Spec D) ──────────────────────────── */}
        <section className="life-landing__section">
          <header className="life-landing__section-head">
            <p className="life-landing__kicker">Just shipped &middot; 2026-05-02</p>
            <h2 className="life-landing__h2">Spec D: production custody.</h2>
            <p className="life-landing__lede">
              An agent's identity now ships with the same custody discipline a
              human's does. Six backends span browser, server, desktop, and
              hardware. Rotation and revocation are first-class events. A single
              canonical multi-curve verifier (<code>lago-auth</code>) replaces
              ad-hoc JWT validation across the stack.
            </p>
          </header>

          <ul className="life-landing__custody-grid">
            {CUSTODY_BACKENDS.map((b) => (
              <li key={b.name} className="life-landing__custody-card">
                <p className="life-landing__custody-surface">{b.surface}</p>
                <p className="life-landing__custody-name">{b.name}</p>
                <p className="life-landing__custody-desc">{b.desc}</p>
              </li>
            ))}
          </ul>

          <p className="life-landing__footnote">
            <span className="life-landing__footnote-label">L4-D5</span>{" "}
            split-custody for browser deployments &middot;{" "}
            <span className="life-landing__footnote-label">L4-D6</span> P-256
            ECDSA across the stack &middot;{" "}
            <span className="life-landing__footnote-label">L4-D10</span>{" "}
            <code>anima.identity_rotated</code> with{" "}
            <code>rotation_proof_jws</code> signed by the old key. Full spec at{" "}
            <a
              href="https://github.com/broomva/life/blob/main/docs/superpowers/specs/2026-04-29-spec-d-anima-custody.md"
              target="_blank"
              rel="noopener noreferrer"
              className="life-landing__inline-link"
            >
              docs/superpowers/specs/spec-d
            </a>
            .
          </p>
        </section>

        {/* ── Quickstart ─────────────────────────────────────────── */}
        <section className="life-landing__section">
          <header className="life-landing__section-head">
            <p className="life-landing__kicker">Start building</p>
            <h2 className="life-landing__h2">Six lines to a running agent.</h2>
          </header>

          <div className="life-landing__code">
            <pre>
              <code>{`# Clone and verify the substrate.
git clone https://github.com/broomva/life.git
cd life && cargo test --workspace

# Generate an agent identity (anima).
cargo run -p arcan -- identity new

# Boot the runtime (arcand) on :3000.
cargo run -p arcand -- --port 3000`}</code>
            </pre>
          </div>

          <p className="life-landing__lede life-landing__lede--small">
            Every event your agent emits is replayable from the journal. No
            mutable state, no hidden side effects, no LLM call needed to
            reconstruct yesterday's session. That's the OS thesis.
          </p>
        </section>

        {/* ── Live demos (preserved project picker) ─────────────── */}
        <section className="life-landing__section">
          <header className="life-landing__section-head">
            <p className="life-landing__kicker">See it run</p>
            <h2 className="life-landing__h2">Live demos.</h2>
            <p className="life-landing__lede">
              Each demo opens a three-column agent workspace &mdash; streaming
              chat, live filesystem and journal, identity + economic + reasoning
              inspectors on the right.
            </p>
          </header>

          <div className="life-landing__grid">
            {PROJECT_ENTRIES.map(([slug, project]) => (
              <Link
                key={slug}
                href={`/life/${slug}`}
                className="life-landing__card"
              >
                <span
                  className={`life-landing__chip life-landing__chip--${project.chipColor}`}
                >
                  {CHIP_LABELS[project.chipColor]}
                </span>
                <div className="life-landing__card-eyebrow">
                  {project.eyebrow}
                </div>
                <div className="life-landing__card-title">
                  {project.displayName}
                </div>
                <div className="life-landing__card-body">
                  Open the {slug} workspace to step through a real Arcan agent
                  run with full filesystem, journal, and metrics inspectors.
                </div>
                <div className="life-landing__card-cta">Open /life/{slug} ▸</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Footer / deep links ────────────────────────────────── */}
        <footer className="life-landing__footer">
          <p className="life-landing__footer-line">
            <strong>Life</strong> is open source under MIT. Published to
            crates.io.
          </p>
          <div className="life-landing__footer-links">
            <a
              href="https://github.com/broomva/life"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://crates.io/crates/arcan"
              target="_blank"
              rel="noopener noreferrer"
            >
              crates.io
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://github.com/broomva/life/blob/main/docs/STATUS.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              changelog
            </a>
            <span aria-hidden="true">·</span>
            <Link href="/launch/life">launch page</Link>
            <span aria-hidden="true">·</span>
            <Link href="/projects/life">project notes</Link>
          </div>
          <p className="life-landing__epigraph">
            LLMs are controllers, not chatbots.
          </p>
        </footer>
      </div>
    </div>
  );
}
