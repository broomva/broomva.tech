import type { Route } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import {
  FadeIn,
  Stagger,
  StaggerItem,
} from "@/components/site/profile-motion";

export const metadata = {
  title: "Now",
  description:
    "What I'm focused on right now: AI-native data platforms, governed agent orchestration, and the open-source Rust runtime substrate.",
};

const focus = [
  "Shipping multi-tenant agentic platforms in production — governed tool use, audit-grade lineage, lakehouse-native data substrates.",
  "Maintaining the open-source Rust Agent OS stack — Life, Lago, Vigil, Haima — as the substrate behind everything else I build.",
  "Productizing the Life Runtime through partner distribution and direct tenants — turning the substrate into recurring revenue.",
];

const learning = [
  "Lakehouse-native streaming patterns (Zerobus, Iceberg, Unity Catalog medallion) and how they replace traditional message-bus architectures.",
  "Recursive Controlled Systems theory — formalizing LLM-as-controller agents with hierarchical stability budgets.",
  "Audit-grade governance as a default property of agent orchestration, not an afterthought.",
];

const open = [
  "Conversations with companies building governed AI platforms in regulated domains.",
  "Partnerships that distribute Life Runtime through industry-specialized integrators.",
  "Engineers contributing to the open-source RCS papers and the Rust agent runtime.",
];

export default function NowPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <FadeIn>
        <PageHero
          description="A monthly snapshot of where my attention is — themes, not project names. For specifics on roles, engagements, and the OSS substrate, see /profile."
          title="Now"
        />
      </FadeIn>

      <FadeIn delay={0.1}>
        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl glass p-6">
            <h2 className="font-display text-2xl">Building now</h2>
            <Stagger className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
              {focus.map((item) => (
                <StaggerItem key={item}>
                  <p>{item}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
          <div className="rounded-2xl glass p-6">
            <h2 className="font-display text-2xl">Learning now</h2>
            <Stagger className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
              {learning.map((item) => (
                <StaggerItem key={item}>
                  <p>{item}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
          <div className="rounded-2xl glass p-6">
            <h2 className="font-display text-2xl">Open to</h2>
            <Stagger className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
              {open.map((item) => (
                <StaggerItem key={item}>
                  <p>{item}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.2}>
        <section className="mt-10 rounded-2xl glass p-6">
          <h2 className="font-display text-2xl">Collaborate</h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            If you're building production agent systems, multi-tenant
            lakehouses, or governed AI platforms — and want to compare
            architectures, constraints, or tooling — open the contact page and
            include your specific bottleneck.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              className="inline-flex rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
              href={"/contact" as Route}
            >
              Contact options
            </Link>
            <Link
              className="inline-flex rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
              href={"/profile" as Route}
            >
              Full profile
            </Link>
          </div>
        </section>
      </FadeIn>
    </main>
  );
}
