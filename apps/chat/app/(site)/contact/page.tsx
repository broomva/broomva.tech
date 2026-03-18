import type { Route } from "next";
import Link from "next/link";
import {
  Mail,
  Github,
  Linkedin,
  Link2,
} from "lucide-react";
import { PageHero } from "@/components/site/page-hero";

const contactLinks = [
  {
    icon: Mail,
    label: "Email",
    handle: "carlos@broomva.tech",
    href: "mailto:carlos@broomva.tech",
    description: "Best for collaboration or consulting inquiries.",
  },
  {
    icon: Github,
    label: "GitHub",
    handle: "github.com/broomva",
    href: "https://github.com/broomva",
    description: "Repos, experiments, and OSS releases.",
  },
  {
    icon: Linkedin,
    label: "LinkedIn",
    handle: "Carlos Escobar-Valbuena",
    href: "https://www.linkedin.com/in/broomva/",
    description: "Professional background and updates.",
  },
  {
    icon: Link2,
    label: "Link hub",
    handle: "broomva.tech/links",
    href: "/links",
    description: "All current public links in one place.",
    external: false,
  },
];

export const metadata = {
  title: "Contact",
  description: "Ways to collaborate with Carlos Escobar-Valbuena.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Contact"
        description="If you are building AI-native products, agent workflows, or harness infrastructure, send context and your current bottleneck."
      />
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {contactLinks.map((item) => {
          const Icon = item.icon;
          const className =
            "glass-card transition hover:-translate-y-0.5 hover:border-ai-blue/40";
          const content = (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                  {item.label}
                </p>
                <p className="mt-2 font-display text-2xl text-text-primary">
                  {item.handle}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  {item.description}
                </p>
              </div>
              <span className="rounded-full border border-border p-2 text-text-primary">
                <Icon size={18} />
              </span>
            </div>
          );

          if (item.external === false) {
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                className={className}
              >
                {content}
              </Link>
            );
          }

          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {content}
            </a>
          );
        })}
      </section>
    </main>
  );
}
