import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Life Agent OS — Open-Source Rust Runtime for Autonomous AI Agents",
  description:
    "The first event-sourced, Rust-native Agent Operating System. 10 subsystems, 62 crates, 1,077 tests. Event-sourced persistence, homeostatic self-regulation, cryptographic identity, native finance.",
  openGraph: {
    title: "Life Agent OS",
    description:
      "Open-source Rust runtime for autonomous AI agents. Event-sourced persistence, homeostatic self-regulation, and native finance.",
    type: "website",
  },
};

const subsystems = [
  {
    name: "Arcan",
    role: "Agent Runtime",
    description: "LLM orchestration, tool execution, SSE streaming",
    icon: "🧠",
  },
  {
    name: "Lago",
    role: "Persistence",
    description: "Append-only journal, blob store, knowledge index",
    icon: "💾",
  },
  {
    name: "Autonomic",
    role: "Self-Regulation",
    description: "Three-pillar homeostasis, 6 economic modes",
    icon: "⚖️",
  },
  {
    name: "Haima",
    role: "Finance",
    description: "x402 payments, secp256k1 wallets, per-task billing",
    icon: "💰",
  },
  {
    name: "Anima",
    role: "Identity",
    description: "Soul profiles, dual keypairs, DID identifiers",
    icon: "🔑",
  },
  {
    name: "Nous",
    role: "Evaluation",
    description: "LLM-as-judge, inline heuristics, EGRI loop",
    icon: "🔍",
  },
  {
    name: "aiOS",
    role: "Kernel Contract",
    description: "Canonical types, traits, event taxonomy",
    icon: "📐",
  },
  {
    name: "Praxis",
    role: "Tool Sandbox",
    description: "Hashline editing, MCP bridge, skill registry",
    icon: "🔧",
  },
  {
    name: "Spaces",
    role: "Networking",
    description: "SpacetimeDB 2.0, real-time agent communication",
    icon: "🌐",
  },
  {
    name: "Vigil",
    role: "Observability",
    description: "OpenTelemetry tracing, GenAI semantic conventions",
    icon: "📡",
  },
];

const stats = [
  { label: "Rust Crates", value: "62" },
  { label: "Tests Passing", value: "1,077" },
  { label: "Lines of Rust", value: "136K+" },
  { label: "Subsystems", value: "10" },
];

const differentiators = [
  {
    title: "Event Sourced",
    description:
      "Every state transition is an immutable event. Time-travel debugging. Deterministic replay without LLM calls. Complete audit trail by construction.",
  },
  {
    title: "Rust-Native",
    description:
      "Memory safety eliminates entire classes of runtime bugs. No GC pauses in the agent loop. Predictable performance under load.",
  },
  {
    title: "Self-Regulating",
    description:
      "Three-pillar homeostasis (operational, cognitive, economic) with hysteresis anti-flapping gates. 6 economic modes prevent budget blowouts.",
  },
  {
    title: "Native Finance",
    description:
      "Agents charge for work via x402 protocol. secp256k1 wallets with encrypted storage. Per-task billing with on-chain settlement.",
  },
  {
    title: "Cryptographic Identity",
    description:
      "Every agent has a soul — Ed25519 + secp256k1 dual keypairs derived via HKDF-SHA256. DID identifiers. Immutable policy manifests.",
  },
  {
    title: "Contract-First",
    description:
      "All subsystems implement traits from the kernel contract. Swap or extend any subsystem without breaking others. Dependency invariants enforced by CI.",
  },
];

export default function LaunchLifePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      {/* Hero */}
      <section className="glass-card relative overflow-hidden px-6 py-14 sm:px-10 sm:py-20 text-center">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-ai-blue/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-web3-green/10 blur-3xl" />

        <p className="relative text-xs uppercase tracking-[0.25em] text-ai-blue mb-4">
          Open Source &middot; MIT License
        </p>
        <h1 className="relative font-display text-4xl text-text-primary sm:text-6xl leading-tight">
          Life Agent OS
        </h1>
        <p className="relative mt-6 mx-auto max-w-2xl text-lg leading-relaxed text-text-secondary sm:text-xl">
          The first Rust-native, event-sourced Agent Operating System. 10
          subsystems that treat AI agent infrastructure as an OS — not a library.
        </p>

        <div className="relative mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="https://github.com/broomva/life"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-ai-blue px-6 py-3 text-sm font-medium text-white transition hover:bg-ai-blue/90"
          >
            View on GitHub
          </a>
          <Link
            href="/projects/life"
            className="rounded-full border border-border px-6 py-3 text-sm font-medium text-text-primary transition hover:border-ai-blue/40 hover:text-ai-blue"
          >
            Read the Docs
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="glass-card px-5 py-6 text-center"
          >
            <p className="font-display text-3xl text-text-primary">
              {stat.value}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      {/* Video */}
      <section className="mt-10">
        <video
          src="/images/projects/life/life-video.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full rounded-xl border border-border"
        />
      </section>

      {/* Why */}
      <section className="mt-16">
        <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
          Why Life?
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary">
          Every major agent framework — LangChain, CrewAI, AutoGen, OpenAI
          Agents SDK — shares the same architectural DNA: Python runtimes,
          mutable state, trust-based execution, and bolt-on persistence. 62% of
          practitioners cite security as their top challenge. Life breaks from
          this pattern entirely.
        </p>
      </section>

      {/* Differentiators */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {differentiators.map((d) => (
          <div key={d.title} className="glass-card px-5 py-6">
            <h3 className="font-display text-lg text-text-primary">
              {d.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {d.description}
            </p>
          </div>
        ))}
      </section>

      {/* Architecture */}
      <section className="mt-16">
        <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
          10 Subsystems
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary">
          Each subsystem maps to a biological system. All implement traits from
          the kernel contract. Swap or extend any part without breaking the rest.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {subsystems.map((s) => (
            <div
              key={s.name}
              className="glass-card flex items-start gap-4 px-5 py-4"
            >
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="font-display text-base text-text-primary">
                  {s.name}{" "}
                  <span className="text-xs uppercase tracking-wider text-text-muted">
                    {s.role}
                  </span>
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Start */}
      <section className="mt-16">
        <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
          Quick Start
        </h2>
        <div className="glass-card mt-6 overflow-x-auto px-6 py-5">
          <pre className="font-mono text-sm text-text-secondary">
            <code>{`# Clone and test
git clone https://github.com/broomva/life.git
cd life && cargo test --workspace  # 1,077 tests

# Start the agent runtime
cargo run -p arcand -- --port 3000

# Create a session
curl -X POST http://localhost:3000/sessions \\
  -H "Content-Type: application/json" \\
  -d '{"model": "anthropic/claude-sonnet-4-20250514"}'

# Stream events
curl http://localhost:3000/sessions/{id}/events/stream`}</code>
          </pre>
        </div>
      </section>

      {/* Architecture Scorecard */}
      <section className="mt-16">
        <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
          Honest Assessment
        </h2>
        <p className="mt-4 text-base text-text-secondary">
          v0.2.0 — production infrastructure takes time to get right.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            { area: "Agent Loop", score: "9/10", status: "strong" },
            { area: "Persistence", score: "10/10", status: "strong" },
            { area: "Tool Harness", score: "9/10", status: "strong" },
            { area: "Memory", score: "8/10", status: "strong" },
            { area: "Observability", score: "8/10", status: "strong" },
            { area: "Security", score: "4/10", status: "wip" },
            { area: "Self-Learning", score: "2/10", status: "wip" },
          ].map((item) => (
            <div
              key={item.area}
              className="glass-card flex items-center justify-between px-5 py-3"
            >
              <span className="text-sm text-text-primary">{item.area}</span>
              <span
                className={`font-mono text-sm ${item.status === "strong" ? "text-web3-green" : "text-text-muted"}`}
              >
                {item.score}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="glass-card relative mt-16 overflow-hidden px-6 py-14 text-center sm:px-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-web3-green/10 blur-3xl" />
        <h2 className="relative font-display text-2xl text-text-primary sm:text-3xl">
          LLMs are controllers, not chatbots.
        </h2>
        <p className="relative mt-4 mx-auto max-w-xl text-base text-text-secondary">
          Life is open source, MIT licensed, and published to crates.io. Start
          building production agent systems today.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="https://github.com/broomva/life"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-ai-blue px-6 py-3 text-sm font-medium text-white transition hover:bg-ai-blue/90"
          >
            Star on GitHub
          </a>
          <a
            href="https://crates.io/crates/arcan"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-border px-6 py-3 text-sm font-medium text-text-primary transition hover:border-ai-blue/40 hover:text-ai-blue"
          >
            cargo install arcan
          </a>
        </div>
      </section>
    </main>
  );
}
