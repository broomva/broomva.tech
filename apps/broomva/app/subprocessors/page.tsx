import Link from "next/link";
import { config } from "@/lib/config";

const providers = [
  {
    name: "Vercel",
    purpose: "Hosting, deployment, storage, analytics, and AI Gateway",
    data: "Account, content, request, technical, and optional analytics data",
    location: "United States and provider-controlled regions",
  },
  {
    name: "Neon",
    purpose: "Database and authentication",
    data: "Account, organization, authentication, chat, and application data",
    location: "Configured database region and provider support locations",
  },
  {
    name: "Stripe",
    purpose: "Checkout, subscriptions, invoices, and payment fraud controls",
    data: "Identity, billing, transaction, and payment data",
    location: "United States and provider-controlled regions",
  },
  {
    name: "Sentry",
    purpose: "Essential error and performance monitoring",
    data: "Error, request, device, and diagnostic data; session replay disabled",
    location: "United States and provider-controlled regions",
  },
  {
    name: "PostHog",
    purpose: "Product reliability events and consented browser analytics",
    data: "Account identifiers, feature events, pages, referrals, and device data",
    location: "United States cloud endpoint",
  },
  {
    name: "Langfuse",
    purpose: "AI and agent observability and model-call tracing",
    data: "User, chat, model, trace, and technical identifiers; telemetry may include prompts and outputs depending on active settings",
    location: "Configured or provider-controlled cloud region",
  },
  {
    name: "Google and GitHub",
    purpose: "Optional account authentication",
    data: "Account identifier, name, email, avatar, and authentication records",
    location: "Provider-controlled regions",
  },
  {
    name: "AI model providers via Vercel AI Gateway",
    purpose: "Generate text, code, images, and other requested outputs",
    data: "Prompts, relevant context, attachments, tool inputs, and generated output",
    location: "Depends on the selected model provider",
  },
  {
    name: "Tavily and Firecrawl",
    purpose: "Web search and URL retrieval when invoked",
    data: "Search queries, URLs, and tool parameters",
    location: "Provider-controlled regions",
  },
  {
    name: "Deployment-configured Redis provider",
    purpose: "Resumable chat streams and short-lived relay state",
    data: "Session and stream identifiers and transient message state",
    location: "Depends on the production REDIS_URL provider and region",
  },
  {
    name: "Broomva-operated Arcan and Lago services",
    purpose: "Agent execution, memory, knowledge, sessions, and public assets",
    data: "Account identifiers, agent/session content, files, and technical data",
    location:
      "Deployment region, including Railway-hosted services where configured",
  },
  {
    name: "OpenRouter",
    purpose: "Alternative AI model gateway when that route is configured",
    data: "Prompts, relevant context, attachments, and generated output",
    location: "United States and downstream provider regions",
  },
  {
    name: "Base Account, configured Base RPC, and the public Base blockchain",
    purpose: "Optional wallet authentication and onchain identity features",
    data: "Wallet address, signed message, chain identifiers, and public immutable blockchain records",
    location:
      "Public distributed blockchain and provider-controlled RPC regions",
  },
];

export const metadata = {
  title: "Subprocessors · broomva.tech",
  description: "Service providers that may process data for broomva.tech.",
};

export default function SubprocessorsPage() {
  return (
    <main className="prose dark:prose-invert container mx-auto max-w-4xl py-10">
      <h1>Subprocessors and service providers</h1>
      <p>
        <strong>Last updated:</strong> August 9, 2026
      </p>
      <p>
        This page identifies material providers and provider categories used to
        deliver broomva.tech. The currently configured model catalog may include{" "}
        {config.services.aiProviders.join(", ")}. The selected model determines
        which model provider receives a request. Not every provider receives
        data from every user: processing depends on the feature, selected model,
        account method, and analytics choice. A public list is a transparency
        aid and is not yet a contract-grade production data-flow inventory; it
        does not replace a signed data-processing or international-transfer
        agreement where one is legally required.
      </p>
      <div className="not-prose overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">Provider</th>
              <th className="p-3">Purpose</th>
              <th className="p-3">Data</th>
              <th className="p-3">Processing location</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr className="border-b align-top" key={provider.name}>
                <td className="p-3 font-medium">{provider.name}</td>
                <td className="p-3">{provider.purpose}</td>
                <td className="p-3">{provider.data}</td>
                <td className="p-3">{provider.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Changes and questions</h2>
      <p>
        We update this page when material providers change. Contract customers
        should use the notice and objection process in their signed agreement.
        Questions may be sent to contact@broomva.tech. See the{" "}
        <Link href="/privacy">Privacy Policy</Link> for purposes, legal grounds,
        transfers, retention, and rights.
      </p>
    </main>
  );
}
