/**
 * Public profile data — single source of truth for /profile and the
 * "Ask Carlos" double (lib/twin). Edit here; both surfaces follow.
 */
import {
  Database,
  Eye,
  GitBranch,
  Layers,
  Network,
  Shield,
  Sparkles,
  Workflow,
} from "lucide-react";

export const concurrent = [
  {
    icon: Sparkles,
    title: "AI Lead",
    org: "Stimulus",
    period: "Nov 2024 – Present",
    blurb:
      "Architecture redesign of an AI-native, Databricks-backed agentic procurement platform serving FIFA 2026 and the Olympics Committee. Lakehouse-native real-time substrate: Databricks Zerobus streaming into a Unity-Catalog-governed medallion architecture (bronze/silver/gold). Multi-document RAG with policy-bounded tool adapters; multi-tenant JWT hardening.",
  },
  {
    icon: Workflow,
    title: "Co-founder & CTO",
    org: "Wedi Pay",
    period: "Oct 2024 – Jun 2026",
    blurb:
      "Agentic cross-border B2B payment orchestration. Multi-tenant Postgres RLS, Kafka/Redpanda event-driven backbone, Databricks gold-table ETLs. Wedi Agents execute payment actions under strict policy/consent/scoped credentials with full audit trails. Signed and shipped payment-rail integrations — Prometeo (open-banking A2A), TruBit/VelaFi (USDC on/off-ramp), Thirdweb (web3-native) — on a provider-agnostic integration layer.",
  },
  {
    icon: Database,
    title: "Data Architect (Contract)",
    org: "TEAM International",
    period: "Nov 2020 – Present",
    blurb:
      "Architectural oversight on the Time Series Engine pipelines I previously led as Sr. ML/AI Tech Lead. Anchor customer: a NYSE-listed US natural-gas operator with ~70K wells across multiple US basins. Multi-tenant streaming + batch telemetry on Databricks + MLflow + PyTorch handling 10K+ records/sec. Production medallion-style bronze/silver/gold tables since 2021.",
  },
];

export const engagements = [
  {
    metric: "3 payment rails · multi-country",
    label: "LATAM payments integration layer",
    blurb:
      "Signed and shipped integrations with Prometeo (open-banking account-to-account), TruBit — now VelaFi (USDC on/off-ramp), and Thirdweb (web3-native) behind one provider-agnostic layer at Wedi Pay.",
  },
  {
    metric: "~70,000 wells · multi-basin",
    label: "NYSE-listed US natural-gas operator",
    blurb:
      "Anchor customer of the Time Series Engine. Production medallion-style lakehouse since 2021 with anomaly detection, alarm threshold estimation, and digital-twin integration.",
  },
  {
    metric: "FIFA 2026 + Olympics Committee scale",
    label: "Tier-1 sports + procurement enterprise",
    blurb:
      "Stimulus customer surface — agentic supplier intelligence with policy-bounded tool adapters and multi-document retrieval.",
  },
  {
    metric: "AWS Premier Consulting Partner",
    label: "US-based AI advisory",
    blurb:
      "Production-grade agentic RAG over an internal SageMaker engineering knowledge base — pgvector + FAISS, three switchable interaction modes (graph-based, tools agent, conversational). Delivery accepted at evaluation stage.",
  },
  {
    metric: "Tier-1 LATAM e-commerce + fintech",
    label: "Recommendation carousel ranking",
    blurb:
      "Polars-based ML pipeline integrating prints/taps/payments event streams into a feature-engineered training set; GridSearchCV tuning with full MLflow autolog reproducibility.",
  },
];

export const ossProjects = [
  {
    icon: Layers,
    name: "Life Agent OS",
    href: "/projects/life",
    desc: "Rust agent runtime kernel. Multi-tenant gateway with TLS 1.3, JWKS, KMS abstraction (Vault Transit / AWS KMS / GCP KMS), token-bucket rate limiting, event-sourced persistence on redb v2, OpenTelemetry-native observability. 15+ crates on crates.io.",
  },
  {
    icon: GitBranch,
    name: "Lago",
    href: "/projects/lago",
    desc: "Event-sourced persistence substrate. Append-only event journal on redb v2; full provenance for every state transition.",
  },
  {
    icon: Eye,
    name: "Vigil",
    href: "/projects/life",
    desc: "OpenTelemetry-native observability foundation for the Life Agent OS. Single crate, four modules, traces + metrics + logs unified.",
  },
  {
    icon: Network,
    name: "Haima",
    href: "/projects/haima",
    desc: "Agentic finance engine. x402 metered machine-to-machine payments with USDC settlement on Base. Six Rust crates; secp256k1 wallet, per-task billing, full audit trails.",
  },
  {
    icon: Workflow,
    name: "bstack + broomva/skills",
    href: "https://github.com/broomva/bstack",
    desc: "Agentic development harness — 20 irreducible automation primitives (policy gates, knowledge bookkeeping, CI productive-wait, persistent cross-context loops, cross-model adversarial review) that turn an agent-driven workspace into a self-operating system, plus 48 portable agent skills (agentskills.io spec) for Claude Code, Codex, Cursor, Gemini CLI, Goose, and Copilot.",
  },
  {
    icon: Shield,
    name: "Recursive Controlled Systems (RCS)",
    href: "/notes",
    desc: "Five-paper series formalizing LLM-as-controller agents as a 7-tuple Σ = (X, Y, U, f, h, S, Π) with recursive stability budgets across hierarchical control levels (L0–L3). Control-native architecture for autonomous workflows — verification causally independent of the acting model — and the ongoing autonomy / search / intelligence research program. Foundations paper complete; 4 papers in progress.",
  },
];
