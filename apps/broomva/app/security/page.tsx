import Link from "next/link";

export const metadata = {
  title: "Security and vulnerability disclosure · broomva.tech",
  description: "How to report a security vulnerability to broomva.tech.",
};

export default function SecurityPage() {
  return (
    <main className="prose dark:prose-invert container mx-auto max-w-3xl py-10">
      <h1>Security and vulnerability disclosure</h1>
      <p>
        <strong>Last updated:</strong> August 9, 2026
      </p>
      <p>
        Report suspected vulnerabilities privately to{" "}
        <a href="mailto:contact@broomva.tech?subject=Security%20report">
          contact@broomva.tech
        </a>
        . Include the affected URL or component, reproduction steps, impact, and
        safe supporting evidence. Do not include unnecessary personal data.
      </p>
      <h2>Good-faith research</h2>
      <p>
        This policy covers the broomva.tech application and source code that
        Carlos D. Escobar-Valbuena controls. It does not authorize testing of
        Vercel, Neon, Stripe, AI providers, other third-party systems, or another
        user&apos;s account or data. Follow each provider&apos;s policy and report
        provider-specific findings to that provider.
      </p>
      <p>
        Please avoid privacy violations, denial of service, social engineering,
        physical intrusion, data destruction, persistence, and access beyond the
        minimum needed to demonstrate the issue. Stop if you encounter personal
        data or secrets, tell us what was exposed, and do not retain or disclose
        it. To the extent within the operator&apos;s authority, we will not
        pursue legal action for good-faith research within this scope that
        follows this policy and applicable law.
      </p>
      <h2>What to expect</h2>
      <p>
        We aim to acknowledge a report within five business days, triage it,
        provide updates when practical, and coordinate disclosure. These are
        response targets, not a contractual SLA or bounty promise. Please give
        us reasonable time to investigate and remediate before public
        disclosure.
      </p>
      <h2>Current posture and limits</h2>
      <p>
        Broomva uses encrypted transport, authentication, authorization checks,
        monitoring, dependency scanning, and a coordinated reporting channel.
        This page does not claim a certification, penetration-test result,
        perfect security, database row-level security, or tamper-evident audit
        logging. Enterprise security commitments apply only in a signed
        agreement.
      </p>
      <p>
        The machine-readable contact is at{" "}
        <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
        Personal-data questions belong at the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
