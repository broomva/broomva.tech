import Link from "next/link";
import { config } from "@/lib/config";

export default function TermsPage() {
  return (
    <main className="prose dark:prose-invert container mx-auto max-w-3xl py-10">
      <h1>{config.policies.terms.title}</h1>
      <p>
        <strong>Effective date:</strong> {config.policies.terms.lastUpdated}
      </p>

      <p>
        These Terms govern the website, AI chat, writing, agent tools, accounts,
        and paid features available at {config.appName} (the
        &quot;Service&quot;). The Service is operated from Bogotá, Colombia by
        {" "}
        <strong>{config.organization.name}</strong> (&quot;Broomva,&quot;
        &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). Broomva is not
        currently represented as a U.S. corporation.
      </p>

      <h2>1. Agreement and changes</h2>
      <p>
        By creating an account, purchasing a plan, or otherwise using the
        Service after being presented with these Terms, you agree to them. If
        you use the Service for an organization, you represent that you may bind
        it. If you do not agree, do not use the Service.
      </p>
      <p>
        We may update these Terms for legal, security, or product reasons. We
        will provide reasonable notice of material changes through the Service
        or by email when we have your address. Changes do not retroactively
        reduce accrued rights, and any consent required by law will be requested
        separately.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least {config.legal.minimumAge}. If applicable law
        requires parental or guardian authorization at a higher age, you must
        have that authorization. You must provide accurate account information,
        protect your credentials, and promptly report unauthorized access.
      </p>

      <h2>3. Service and acceptable use</h2>
      <p>
        Broomva provides AI-assisted chat, research, content, and software-agent
        features. Features, models, limits, and beta capabilities may change.
        You may not use the Service to break the law, violate another
        person&apos;s rights, distribute malware, evade safeguards, gain
        unauthorized access, overload or scrape the Service contrary to
        published controls, impersonate others, or generate or distribute
        unlawful or materially harmful content.
      </p>
      <p>
        We may suspend access when reasonably necessary to investigate abuse,
        protect users or systems, comply with law, or address nonpayment. Where
        practicable, we will give notice and an opportunity to cure.
      </p>

      <h2>4. AI notice and output</h2>
      <p>
        You are interacting with artificial-intelligence systems when using the
        chat and agent features. Outputs may be inaccurate, incomplete,
        outdated, or similar to material produced for others. Do not treat them
        as legal, medical, financial, or other professional advice. Review
        outputs before relying on or publishing them, especially where safety,
        rights, money, or reputation are affected.
      </p>
      <p>
        As between you and Broomva, you retain rights in your prompts and other
        original content. To the extent permitted by law and subject to any
        third-party rights, Broomva assigns to you any rights it may have in the
        output generated specifically for you. We do not promise that an output
        is copyrightable, unique, non-infringing, or free of third-party claims.
        You grant Broomva a non-exclusive license to host, process, transmit,
        and display your content only as needed to operate, secure, and improve
        the Service in accordance with the Privacy Policy.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        The Service relies on infrastructure, authentication, payment,
        analytics, error-monitoring, search, and AI providers. Their availability
        and processing can affect the Service. Our current categories and
        providers are described on the <Link href="/subprocessors">Subprocessors</Link>
        {" "}page and in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>6. Plans, recurring billing, and taxes</h2>
      <p>
        Prices are displayed in U.S. dollars unless stated otherwise. Before a
        paid checkout, we will display the plan, billing interval, price, and
        material limitations. Monthly subscriptions renew automatically until
        canceled. Stripe processes payment details; Broomva does not store full
        card numbers. You authorize recurring charges for the selected plan.
      </p>
      <p>
        You may cancel before the next renewal through account settings or by
        contacting us. Access ordinarily continues through the paid period. Fees
        are non-refundable except where the checkout, a written agreement, or
        applicable consumer law provides otherwise. Mandatory withdrawal,
        reversal, warranty, tax, and refund rights are not waived. We will give
        advance notice of price changes that affect a future renewal.
      </p>
      <p>
        Enterprise commitments—including service levels, credits, security
        schedules, data residency, support, and data-processing terms—apply only
        when included in a separate signed agreement. Marketing descriptions do
        not independently create an SLA or compliance certification.
      </p>

      <h2>7. Privacy and security</h2>
      <p>
        Our <Link href="/privacy">Privacy Policy</Link> describes personal-data
        processing and rights. Our <Link href="/security">Security page</Link>
        describes vulnerability reporting and the limits of public security
        statements. Do not submit secrets, regulated records, or sensitive
        personal data unless a feature and written agreement expressly support
        that use.
      </p>

      <h2>8. Broomva intellectual property</h2>
      <p>
        The hosted Service, design, trademarks, and Broomva content remain ours
        or our licensors&apos;. These Terms give you a limited, revocable,
        non-transferable right to use the hosted Service for its intended
        purpose. Source code identified as open source is governed by the
        license included with the relevant repository or package; these Terms
        do not narrow those open-source rights.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        To the extent permitted by law, the Service is provided &quot;as
        is&quot; and &quot;as available.&quot; We do not promise uninterrupted,
        error-free, or perfectly secure operation, or that AI outputs will be
        accurate or fit for a particular purpose. Nothing here excludes a
        warranty or remedy that applicable law does not allow us to exclude.
      </p>

      <h2>10. Liability</h2>
      <p>
        To the extent permitted by law, neither party is liable for indirect,
        incidental, special, punitive, or consequential losses, or lost profits,
        revenue, goodwill, or data, arising from the Service. Broomva&apos;s total
        aggregate liability arising from the Service will not exceed the greater
        of the amount you paid Broomva during the 12 months before the event
        giving rise to the claim or USD 100.
      </p>
      <p>
        These limits do not apply where prohibited by law and do not limit
        liability for fraud, willful misconduct, gross negligence, death or
        personal injury caused by negligence, infringement that cannot lawfully
        be limited, or mandatory consumer and data-protection rights.
      </p>

      <h2>11. Responsibility for misuse</h2>
      <p>
        To the extent permitted by law, you will compensate Broomva for
        third-party claims and reasonable costs caused by your unlawful use of
        the Service, your content&apos;s infringement of third-party rights, or
        your material breach of these Terms. This does not apply to the extent a
        claim was caused by Broomva, and it does not displace non-waivable
        consumer rights.
      </p>

      <h2>12. Termination and data</h2>
      <p>
        You may stop using the Service or cancel an account. On termination,
        provisions that by nature should survive will survive. Account closure
        is not necessarily an erasure request: data may be retained for billing,
        security, fraud prevention, legal claims, backups, or other lawful
        purposes described in the Privacy Policy. You may separately exercise
        applicable privacy rights.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the {config.legal.governingLaw}.
        Subject to any mandatory forum or consumer right, disputes will be heard
        by the competent courts in Bogotá, Colombia. Nothing in this section
        deprives a consumer of mandatory protections or a forum available under
        applicable law.
      </p>

      <h2>14. General</h2>
      <p>
        If a provision is unenforceable, it will be limited only as necessary
        and the remainder stays effective. A failure to enforce a provision is
        not a waiver. These Terms, the Privacy Policy, the checkout disclosures,
        and any signed order or enterprise agreement form the agreement for the
        Service; a signed agreement controls where it expressly conflicts.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions or legal notices may be sent to {config.organization.contact.legalEmail}.
        {" "}Operator location: Bogotá, Colombia. Website: {config.appUrl}.
      </p>
    </main>
  );
}
