import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { config } from "@/lib/config";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with AI-powered chat and exploration.",
    credits: "500 credits/month",
    features: [
      "AI chat with community models",
      "500 AI credits included monthly",
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
      "For builders who need full model access and deeper capabilities.",
    credits: "5,000 credits/month",
    features: [
      "All AI models (Claude, GPT, Gemini, and more)",
      "5,000 AI credits included monthly",
      "Usage-based overage at $0.01/credit",
      "Console access with usage dashboard",
      "1 API key for programmatic access",
      "Deep research and agent skills",
      "Priority support",
    ],
    cta: "Start Pro",
    ctaHref: "/login?plan=pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$50",
    period: "/seat/month",
    description: "Collaborative workspace for teams building with AI agents.",
    credits: "20,000 credits/month",
    features: [
      "Everything in Pro",
      "20,000 AI credits included monthly",
      "Shared workspace and conversations",
      "Up to 10 API keys",
      "Priority model access",
      "Team member management",
      "Usage analytics per member",
    ],
    cta: "Start Team",
    ctaHref: "/login?plan=team",
    highlighted: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description:
      "Managed Life Agent OS deployment with dedicated infrastructure.",
    credits: "Unlimited credits",
    features: [
      "Everything in Team",
      "Managed Life Agent OS instance",
      "Dedicated Arcan, Lago, and Autonomic services",
      "Custom subdomain (you.broomva.tech)",
      "Unlimited API keys",
      "SLA guarantees with financial backing",
      "Data residency and compliance controls",
      "Dedicated support and onboarding",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:contact@broomva.tech?subject=Enterprise%20Plan",
    highlighted: false,
  },
];

export const metadata = {
  title: "Pricing — broomva.tech",
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
          The platform is open source. The AI is pay-as-you-go. Start free,
          scale when you need to.
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

            <Link
              href={plan.ctaHref}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-16 text-center">
        <h2 className="text-2xl font-semibold mb-4">
          How credits work
        </h2>
        <div className="mx-auto max-w-2xl text-muted-foreground space-y-3 text-sm">
          <p>
            Every AI request costs credits based on the model and tokens used.
            Lightweight models like GPT-5 Nano cost fractions of a credit.
            Premium models like Claude Opus cost more.
          </p>
          <p>
            1 credit = $0.01. Your plan includes a monthly credit allocation.
            Pro and Team plans allow overage at $0.01/credit, billed via Stripe
            at the end of the billing period.
          </p>
          <p>
            Free tier credits reset monthly. Unused credits do not roll over.
          </p>
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          All plans include the open-source agent platform.{" "}
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
