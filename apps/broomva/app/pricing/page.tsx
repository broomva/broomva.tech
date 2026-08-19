import type { Route } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { config } from "@/lib/config";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with AI-powered chat and exploration.",
    credits: "50 included credits",
    features: [
      "AI chat with selected models",
      "50 AI credits on entry to the Free plan",
      "Blog and writing access",
      "Basic conversation history",
    ],
    cta: "Get Started",
    ctaHref: "/login",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description:
      "For builders who need the full deployed model catalog and deeper capabilities.",
    credits: "5,000 credits/month",
    features: [
      "Deployed model catalog (including selected Claude, GPT, and Gemini models)",
      "5,000 AI credits included monthly",
      "Console access with usage dashboard",
      "1 API key for programmatic access",
      "Deep research and agent skills",
      "Support through the published contact channel",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:contact@broomva.tech?subject=Pro%20Plan",
    highlighted: true,
  },
  {
    name: "Team",
    price: "Contact",
    period: "",
    description: "Collaborative workspace for teams building with AI agents.",
    credits: "20,000 credits/month",
    features: [
      "Everything in Pro",
      "20,000 AI credits included monthly",
      "Shared workspace and conversations",
      "Up to 10 API keys",
      "Team member management",
      "Team usage dashboard",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:contact@broomva.tech?subject=Team%20Plan",
    highlighted: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description:
      "Managed Life Agent OS deployment with dedicated infrastructure.",
    credits: "Custom allocation under signed agreement",
    features: [
      "Everything in Team",
      "Managed Life Agent OS instance",
      "Dedicated Arcan, Lago, and Autonomic services",
      "Custom subdomain (you.broomva.tech)",
      "Unlimited API keys",
      "SLA commitments under a separate written agreement",
      "Data residency options subject to technical validation",
      "Dedicated support and onboarding",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:contact@broomva.tech?subject=Enterprise%20Plan",
    highlighted: false,
  },
];

export const metadata = {
  title: "Pricing · broomva.tech",
  description:
    "AI-powered platform for builders. Free to start, scale as you grow.",
};

export default function PricingPage() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-16">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Open AI for all
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Published components use the license included with their repository or
          package. Hosted AI plans are subscriptions. Start free, then scale
          when you need to.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-xl border p-6 ${
              plan.highlighted
                ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                : "border-border bg-card"
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span className="text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan.description}
              </p>
            </div>

            <div className="mb-6 rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium">
              {plan.credits}
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {plan.ctaHref.startsWith("mailto:") ? (
              <a
                href={plan.ctaHref}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {plan.cta}
              </a>
            ) : (
              <Link
                href={plan.ctaHref as Route}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mt-16 text-center">
        <h2 className="text-2xl font-semibold mb-4">How credits work</h2>
        <div className="mx-auto max-w-2xl text-muted-foreground space-y-3 text-sm">
          <p>
            Every AI request costs credits based on the model and tokens used.
            Lightweight models like GPT-5 Nano cost fractions of a credit.
            Premium models like Claude Opus cost more.
          </p>
          <p>
            Credits are usage units, not stored monetary value. Paid plans use
            monthly allocations; the Free plan does not. Usage pauses at the
            plan limit, and overage billing is not currently enabled.
          </p>
          <p>
            The Free plan receives 50 credits on initial registration and when a
            paid subscription transitions back to Free; they do not reset
            monthly. Paid allocations reset with the applicable billing period.
            Unused credits do not roll over.
          </p>
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          Published source code is available under the license included with the
          relevant repository or package. Hosted plans are subscriptions.{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>{" "}
          apply.
        </p>
      </div>
    </main>
  );
}
