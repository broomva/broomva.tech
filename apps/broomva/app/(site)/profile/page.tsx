import {
  ArrowDownToLine,
  Database,
  Eye,
  FileText,
  GitBranch,
  Github,
  Layers,
  Linkedin,
  Network,
  Shield,
  Sparkles,
  Star,
  Workflow,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { ContentCard } from "@/components/site/content-card";
import { PageHero } from "@/components/site/page-hero";
import { ProfileKPIs } from "@/components/site/profile-kpis";
import {
  FadeIn,
  LiftCard,
  Stagger,
  StaggerItem,
} from "@/components/site/profile-motion";
import { getLatest } from "@/lib/content";
import { formatDate } from "@/lib/date";
import {
  formatNumber,
  getBookkeepingSnapshot,
  getCratesAggregate,
  getGitHubAggregate,
} from "@/lib/profile-stats";

export const metadata: Metadata = {
  title: "Profile — Carlos D. Escobar-Valbuena",
  description:
    "Agent OS architect and AI engineering lead. AI Lead at Stimulus, Data Architect contractor at TEAM International, Co-founder/CTO at Wedi Pay (2024–2026). Builder of Life Agent OS, Lago, Vigil, and the RCS paper series.",
  alternates: { canonical: "/profile" },
  openGraph: {
    title: "Carlos D. Escobar-Valbuena — Agent OS Architect & AI Engineering Lead",
    description:
      "AI-native, multi-tenant data platforms in production. AI Lead at Stimulus, Data Architect at TEAM International, Co-founder/CTO at Wedi Pay (2024–2026). MSc AI at Universidad de los Andes.",
    type: "profile",
  },
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Carlos D. Escobar-Valbuena",
  alternateName: "broomva",
  jobTitle: "Agent OS Architect & AI Engineering Lead",
  description:
    "AI Engineering Lead and data platform architect with 7+ years building AI-native, multi-tenant data platforms in production across regulated and high-stakes domains.",
  url: "https://broomva.tech/profile",
  sameAs: [
    "https://linkedin.com/in/broomva",
    "https://github.com/Broomva",
    "https://x.com/broomva_tech",
    "https://broomva.tech",
  ],
  email: "carlosdavidescobar@gmail.com",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Bogotá",
    addressCountry: "Colombia",
  },
  knowsAbout: [
    "Lakehouse architecture",
    "Databricks",
    "Unity Catalog",
    "Medallion architecture",
    "Production RAG",
    "Agent orchestration",
    "LangGraph",
    "MCP",
    "Data governance",
    "OpenTelemetry",
    "CDC and event sourcing",
    "Multi-tenant data isolation",
    "Rust",
    "Python",
    "TypeScript",
  ],
  alumniOf: [
    {
      "@type": "EducationalOrganization",
      name: "Universidad de los Andes",
      description: "MSc Artificial Intelligence (2026)",
    },
    {
      "@type": "EducationalOrganization",
      name: "Universidad de San Buenaventura",
      description: "BSc Mechatronics Engineering (2018, GPA 4.1/5.0)",
    },
  ],
};

const concurrent = [
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

const engagements = [
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
    metric: "$250M+ AUM · 3,000+ bedrooms",
    label: "Canadian property-management group",
    blurb:
      "First paying tenant of Broomva Life Runtime — Sentinel work-order audit module. Pro-tier SLA, USDC-on-Base billing rail.",
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

const ossProjects = [
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
    icon: Shield,
    name: "Recursive Controlled Systems (RCS)",
    href: "/notes",
    desc: "Five-paper series formalizing LLM-as-controller agents as a 7-tuple Σ = (X, Y, U, f, h, S, Π) with recursive stability budgets across hierarchical control levels (L0–L3). Foundations paper complete; 4 papers in progress.",
  },
];

const stackClusters = [
  {
    title: "Lakehouse & Data Platforms",
    items: [
      "Databricks (deep)",
      "Unity Catalog RBAC",
      "Zerobus streaming",
      "Medallion architecture",
      "Delta Lake",
      "Snowflake",
      "PySpark",
      "Iceberg",
      "Trino",
      "Kafka / Redpanda",
      "Dagster",
      "MLflow",
    ],
  },
  {
    title: "AI / RAG / Agentic",
    items: [
      "Anthropic Claude",
      "OpenAI",
      "AWS Bedrock",
      "LangChain",
      "LangGraph",
      "LangSmith",
      "Langfuse",
      "MCP",
      "pgvector",
      "FAISS",
      "BM25 hybrid retrieval",
      "LLM-as-judge",
    ],
  },
  {
    title: "Cloud & Observability",
    items: [
      "AWS",
      "Azure",
      "GCP",
      "Kubernetes",
      "Terraform",
      "OpenTelemetry (vigil author)",
      "CloudWatch",
      "Datadog",
    ],
  },
  {
    title: "Languages & Runtime",
    items: [
      "Python",
      "Rust",
      "TypeScript",
      "SQL",
      "Next.js",
      "FastAPI",
      "PyTorch",
      "Hugging Face",
    ],
  },
];

const cvDownloads = [
  {
    label: "Master CV",
    description: "Full surface — every role, OSS, research, education.",
    href: "/cv/carlos-escobar-cv-master.pdf",
    pages: "5 pp",
  },
  {
    label: "Targeted (AI Data Architect)",
    description: "Lakehouse + RAG + governance focus.",
    href: "/cv/carlos-escobar-cv-targeted.pdf",
    pages: "3 pp",
  },
  {
    label: "Executive",
    description: "One-page top-line summary.",
    href: "/cv/carlos-escobar-cv-exec.pdf",
    pages: "1 pp",
  },
];

const elsewhereLinks = [
  {
    label: "GitHub",
    handle: "@Broomva",
    href: "https://github.com/Broomva",
    icon: Github,
    blurb:
      "OSS substrate, agent runtime, control metalayer, and the bstack skill catalog.",
  },
  {
    label: "LinkedIn",
    handle: "in/broomva",
    href: "https://linkedin.com/in/broomva",
    icon: Linkedin,
    blurb: "Career timeline, role progression, and connections.",
  },
  {
    label: "X / Twitter",
    handle: "@broomva_tech",
    href: "https://x.com/broomva_tech",
    icon: Sparkles,
    blurb:
      "Notes from the build — agent OS, RCS papers, and what I'm thinking about.",
  },
];

export default async function ProfilePage() {
  const [github, crates, bookkeeping, writing, notes] = await Promise.all([
    getGitHubAggregate("broomva"),
    getCratesAggregate(),
    getBookkeepingSnapshot(),
    getLatest("writing", 3),
    getLatest("notes", 3),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        type="application/ld+json"
      />

      <FadeIn>
        <PageHero
          description="Agent OS architect and AI engineering lead. I build AI-native, multi-tenant data platforms in production — across regulated and high-stakes domains. Concurrent senior leadership across Stimulus (AI Lead), TEAM International (Data Architect), and Wedi Pay (Co-founder/CTO, 2024–2026). Open-source author of Life Agent OS, Lago, Vigil, and the RCS paper series. MSc AI at Universidad de los Andes (2026)."
          title="Carlos D. Escobar-Valbuena"
        />
      </FadeIn>

      {/* Live signals */}
      <FadeIn delay={0.1}>
        <section className="mt-10">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Live signals
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Pulled directly from GitHub and crates.io — what the substrate is
            actually doing this week.
          </p>
          <ProfileKPIs
            crates={{
              totalCrates: crates.totalCrates,
              totalDownloads: crates.totalDownloads,
            }}
            github={{
              totalRepos: github.totalRepos,
              totalStars: github.totalStars,
            }}
            lastPushRelative={github.topRepos[0]?.pushedAtRelative ?? "—"}
            lastPushRepo={github.topRepos[0]?.name ?? "—"}
            recentCount={writing.length + notes.length}
            recentLabel="Recent writing"
          />
          <p className="mt-3 text-xs text-text-muted">
            Updated hourly · {formatNumber(github.totalStars)} ★ ·{" "}
            {formatNumber(crates.totalDownloads)} crate downloads
          </p>
        </section>
      </FadeIn>

      {/* Knowledge graph */}
      {bookkeeping && bookkeeping.totalEntities > 0 && (
        <FadeIn delay={0.13}>
          <section className="mt-12">
            <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
              Knowledge graph
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              The Broomva bookkeeping pipeline scores and promotes raw extracts
              into a queryable entity graph. This is what's in the graph right
              now — last sync {bookkeeping.lastRunRelative || "recent"}.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl glass p-5">
                <div className="text-xs uppercase tracking-wider text-text-muted">
                  Entities
                </div>
                <div className="mt-3 font-display text-3xl text-text-primary">
                  {formatNumber(bookkeeping.totalEntities)}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  in the graph
                </div>
              </div>
              <div className="rounded-2xl glass p-5">
                <div className="text-xs uppercase tracking-wider text-text-muted">
                  Top-scored
                </div>
                <div className="mt-3 font-display text-3xl text-text-primary">
                  {formatNumber(bookkeeping.topScored)}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  scored 8/9 or 9/9
                </div>
              </div>
              <div className="rounded-2xl glass p-5">
                <div className="text-xs uppercase tracking-wider text-text-muted">
                  Last 7 days
                </div>
                <div className="mt-3 font-display text-3xl text-text-primary">
                  {formatNumber(bookkeeping.recentPromotions7d)}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  new promotions
                </div>
              </div>
              <div className="rounded-2xl glass p-5">
                <div className="text-xs uppercase tracking-wider text-text-muted">
                  Composition
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(bookkeeping.byType)
                    .toSorted(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([type, count]) => (
                      <span
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary"
                        key={type}
                      >
                        {type} · {count}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </section>
        </FadeIn>
      )}

      {/* Concurrent leadership */}
      <FadeIn delay={0.15}>
        <section className="mt-16">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Concurrent leadership
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Three Principal-tier roles in parallel since late 2024 — compressed
            surface area across fintech / payments, agentic procurement, and
            enterprise data platforms.
          </p>
          <Stagger className="mt-6 grid gap-5 lg:grid-cols-3">
            {concurrent.map((role) => {
              const Icon = role.icon;
              return (
                <StaggerItem key={role.org}>
                  <LiftCard className="glass-card flex h-full flex-col p-6">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ai-blue/10 text-ai-blue">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="text-xs uppercase tracking-wider text-text-muted">
                        {role.period}
                      </div>
                    </div>
                    <h3 className="mt-4 font-display text-lg text-text-primary">
                      {role.title}
                    </h3>
                    <div className="mt-1 text-sm font-medium text-ai-blue">
                      {role.org}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                      {role.blurb}
                    </p>
                  </LiftCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
      </FadeIn>

      {/* Selected engagements */}
      <FadeIn delay={0.2}>
        <section className="mt-16">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Selected engagements
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Anonymized references — case studies available under mutual NDA.
          </p>
          <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {engagements.map((eng) => (
              <StaggerItem key={eng.label}>
                <LiftCard className="glass-card flex h-full flex-col p-5">
                  <div className="font-mono text-xs uppercase tracking-wider text-text-muted">
                    {eng.label}
                  </div>
                  <div className="mt-2 font-display text-lg text-text-primary">
                    {eng.metric}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                    {eng.blurb}
                  </p>
                </LiftCard>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      </FadeIn>

      {/* Open source & research */}
      <FadeIn delay={0.25}>
        <section className="mt-16">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Open source & research
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
            The substrate behind everything else — published as MIT/Apache OSS.
          </p>
          <Stagger className="mt-6 grid gap-4 lg:grid-cols-2">
            {ossProjects.map((p) => {
              const Icon = p.icon;
              return (
                <StaggerItem key={p.name}>
                  <LiftCard className="h-full">
                    <Link
                      className="glass-card group flex h-full gap-4 p-5 transition hover:border-ai-blue/40"
                      href={p.href as Route}
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ai-blue/10 text-ai-blue">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-lg text-text-primary group-hover:text-ai-blue">
                          {p.name}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                          {p.desc}
                        </p>
                      </div>
                    </Link>
                  </LiftCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
      </FadeIn>

      {/* Top repos — live from GitHub */}
      {github.topRepos.length > 0 && (
        <FadeIn delay={0.3}>
          <section className="mt-16">
            <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
              Most-starred repos
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Live from GitHub. Updated hourly.
            </p>
            <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {github.topRepos.map((repo) => (
                <StaggerItem key={repo.name}>
                  <LiftCard className="h-full">
                    <a
                      className="glass-card group flex h-full flex-col p-5 transition hover:border-ai-blue/40"
                      href={repo.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="truncate font-display text-base text-text-primary group-hover:text-ai-blue">
                          {repo.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                          <Star className="h-3.5 w-3.5" />
                          {repo.stars}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-secondary">
                          {repo.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                        {repo.language && <span>{repo.language}</span>}
                        {repo.language && <span>·</span>}
                        <span>{repo.pushedAtRelative}</span>
                      </div>
                    </a>
                  </LiftCard>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </FadeIn>
      )}

      {/* Top crates — live from crates.io */}
      {crates.topCrates.length > 0 && (
        <FadeIn delay={0.35}>
          <section className="mt-16">
            <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
              Life Agent OS — published crates
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Live from crates.io. The Rust substrate of the agent runtime.
            </p>
            <Stagger className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {crates.topCrates.map((crate) => (
                <StaggerItem key={crate.name}>
                  <a
                    className="glass-card group flex h-full flex-col p-4 transition hover:border-ai-blue/40"
                    href={crate.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="truncate font-mono text-sm text-text-primary group-hover:text-ai-blue">
                        {crate.name}
                      </h3>
                      <span className="text-xs text-text-muted">
                        v{crate.version}
                      </span>
                    </div>
                    {crate.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                        {crate.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                      <span>{formatNumber(crate.downloads)} downloads</span>
                      <span>{crate.updatedAtRelative}</span>
                    </div>
                  </a>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </FadeIn>
      )}

      {/* Recent writing */}
      {(writing.length > 0 || notes.length > 0) && (
        <FadeIn delay={0.4}>
          <section className="mt-16">
            <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
              Recent writing
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Long-form essays and short notes from the build.
            </p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {writing.length > 0 && (
                <div>
                  <h3 className="mb-4 font-display text-lg text-text-primary">
                    Writing
                  </h3>
                  <Stagger className="grid gap-3">
                    {writing.map((entry) => (
                      <StaggerItem key={entry.slug}>
                        <ContentCard
                          href={`/writing/${entry.slug}` as Route}
                          meta={formatDate(entry.date)}
                          summary={entry.summary}
                          title={entry.title}
                        />
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              )}
              {notes.length > 0 && (
                <div>
                  <h3 className="mb-4 font-display text-lg text-text-primary">
                    Notes
                  </h3>
                  <Stagger className="grid gap-3">
                    {notes.map((entry) => (
                      <StaggerItem key={entry.slug}>
                        <ContentCard
                          href={`/notes/${entry.slug}` as Route}
                          meta={formatDate(entry.date)}
                          summary={entry.summary}
                          title={entry.title}
                        />
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              )}
            </div>
          </section>
        </FadeIn>
      )}

      {/* Stack */}
      <FadeIn delay={0.45}>
        <section className="mt-16">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Stack
          </h2>
          <Stagger className="mt-6 grid gap-5 lg:grid-cols-2">
            {stackClusters.map((cluster) => (
              <StaggerItem key={cluster.title}>
                <div className="rounded-2xl glass p-5">
                  <h3 className="font-display text-base text-text-primary">
                    {cluster.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cluster.items.map((item) => (
                      <span
                        className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
                        key={item}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      </FadeIn>

      {/* Elsewhere */}
      <FadeIn delay={0.5}>
        <section className="mt-16">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Elsewhere
          </h2>
          <Stagger className="mt-6 grid gap-4 sm:grid-cols-3">
            {elsewhereLinks.map((link) => {
              const Icon = link.icon;
              return (
                <StaggerItem key={link.label}>
                  <LiftCard className="h-full">
                    <a
                      className="glass-card group flex h-full flex-col p-5 transition hover:border-ai-blue/40"
                      href={link.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ai-blue/10 text-ai-blue">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="font-display text-base text-text-primary group-hover:text-ai-blue">
                            {link.label}
                          </h3>
                          <div className="text-xs text-text-muted">
                            {link.handle}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                        {link.blurb}
                      </p>
                    </a>
                  </LiftCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
      </FadeIn>

      {/* Download CV */}
      <FadeIn delay={0.55}>
        <section className="mt-16">
          <h2 className="font-display text-2xl text-text-primary sm:text-3xl">
            Download CV
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Three lengths — pick the one that fits your read time.
          </p>
          <Stagger className="mt-6 grid gap-4 sm:grid-cols-3">
            {cvDownloads.map((cv) => (
              <StaggerItem key={cv.label}>
                <LiftCard className="h-full">
                  <a
                    className="glass-card group flex h-full flex-col p-5 transition hover:border-ai-blue/40"
                    download
                    href={cv.href}
                  >
                    <div className="flex items-center justify-between">
                      <FileText className="h-5 w-5 text-ai-blue" />
                      <span className="text-xs uppercase tracking-wider text-text-muted">
                        {cv.pages}
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-lg text-text-primary group-hover:text-ai-blue">
                      {cv.label}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {cv.description}
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-ai-blue">
                      <ArrowDownToLine className="h-4 w-4" /> Download PDF
                    </div>
                  </a>
                </LiftCard>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      </FadeIn>

      {/* Contact CTA */}
      <FadeIn delay={0.6}>
        <section className="mt-16 rounded-2xl glass p-8">
          <h2 className="font-display text-2xl text-text-primary">Talk to me</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            If you're building production agent systems, multi-tenant
            lakehouses, or governed AI platforms — and want to compare
            architectures or discuss a role — open the contact page with your
            specific bottleneck. Detailed engagement narratives available under
            mutual NDA.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
              href="/contact"
            >
              Contact options
            </Link>
            <Link
              className="inline-flex rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
              href="/now"
            >
              What I'm building now
            </Link>
          </div>
        </section>
      </FadeIn>
    </main>
  );
}
