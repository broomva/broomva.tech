import { config } from "@/lib/config";

export default function TermsPage() {
  const currencySymbolMap: Record<string, string> = {
    USD: "$",
    EUR: "\u20AC",
    GBP: "\u00A3",
  };

  const currencyCode = config.pricing?.currency;
  const currencySymbol = currencyCode
    ? (currencySymbolMap[currencyCode] ?? currencyCode)
    : "";
  const hasFree = Boolean(config.pricing?.free);
  const hasPro = Boolean(config.pricing?.pro);
  const hasAnyPlan = hasFree || hasPro;
  const paymentProcessors = Array.isArray(config.services?.paymentProcessors)
    ? config.services.paymentProcessors
    : [];

  return (
    <main className="prose dark:prose-invert container mx-auto max-w-3xl py-10">
      <h1>{config.policies.terms.title}</h1>
      {config.policies.terms.lastUpdated ? (
        <p>
          <strong>Effective date:</strong> {config.policies.terms.lastUpdated}
        </p>
      ) : null}

      <p>
        Welcome to {config.appName}. These Terms of Service (&quot;Terms&quot;)
        govern your access to and use of the website, AI chat interface, blog
        and writing platform, agent skills, and related services (collectively,
        the &quot;Service&quot;) operated by {config.organization.name} (
        &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or
        using {config.appName}, you agree to be bound by these Terms. If you do
        not agree, please do not use the Service.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using the Service, you acknowledge that you have read,
        understood, and agree to be bound by these Terms and our Privacy Policy.
        We reserve the right to modify these Terms at any time. Material changes
        will be indicated by updating the &quot;Effective date&quot; above. Your
        continued use of the Service after any modifications constitutes
        acceptance of the updated Terms.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        {config.appName} is an AI-powered platform that provides:
      </p>
      <ul>
        <li>
          <strong>AI Chat Interface</strong>: An interactive chat experience
          powered by multiple AI models for answering questions, generating
          content, and assisting with research.
        </li>
        <li>
          <strong>Writing and Blog</strong>: A content platform for publishing
          and reading articles, notes, and projects.
        </li>
        <li>
          <strong>Agent Skills</strong>: Specialized AI capabilities including
          deep research, image generation, web search, code execution, and other
          tool-augmented features.
        </li>
      </ul>
      <p>
        The Service is hosted on {config.services.hosting} and integrates with
        AI technology providers including{" "}
        {config.services.aiProviders.join(", ")} to deliver AI-powered
        functionality.
      </p>

      <h2>3. Account Registration and Authentication</h2>
      <p>
        Certain features of the Service require you to create an account. You
        may register using Google or GitHub authentication. You are responsible
        for maintaining the confidentiality of your account credentials and for
        all activities that occur under your account. You agree to notify us
        immediately of any unauthorized use of your account.
      </p>
      <p>
        You must be at least {config.legal.minimumAge} years of age to use the
        Service. By creating an account, you represent that you meet this age
        requirement.
      </p>

      <h2>4. User Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate any applicable laws or regulations</li>
        <li>Infringe upon any intellectual property or proprietary rights</li>
        <li>
          Use the Service to generate, distribute, or store illegal, harmful,
          threatening, abusive, defamatory, or otherwise objectionable content
        </li>
        <li>Distribute malware, viruses, or other harmful code</li>
        <li>
          Attempt unauthorized access to our systems, accounts, or data
        </li>
        <li>
          Conduct automated scraping, crawling, or data extraction beyond what
          is expressly permitted
        </li>
        <li>
          Interfere with or disrupt the integrity or performance of the Service
        </li>
        <li>
          Use the AI chat or agent features to generate content that violates
          these Terms or any applicable law
        </li>
        <li>
          Impersonate any person or entity or misrepresent your affiliation
        </li>
      </ul>

      <h2>5. AI-Generated Content</h2>
      <p>
        The Service uses artificial intelligence to generate responses,
        content, and other outputs. You acknowledge and agree that:
      </p>
      <ul>
        <li>
          AI-generated content may not always be accurate, complete, or
          up-to-date. You should independently verify any important information.
        </li>
        <li>
          AI responses do not constitute professional advice (legal, medical,
          financial, or otherwise). You should consult qualified professionals
          for such matters.
        </li>
        <li>
          We do not guarantee the suitability of AI-generated content for any
          particular purpose.
        </li>
        <li>
          You are solely responsible for how you use AI-generated content and
          any decisions you make based on it.
        </li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>
        All content, features, functionality, trademarks, and branding of{" "}
        {config.appName} are the property of {config.organization.name} or its
        licensors and are protected by intellectual property laws. You may not
        reproduce, distribute, modify, or create derivative works of any
        portion of the Service without our express written permission.
      </p>
      <p>
        You retain ownership of any original content you submit to the Service.
        By submitting content, you grant us a non-exclusive, worldwide,
        royalty-free license to use, process, and display that content solely
        for the purpose of operating and providing the Service.
      </p>

      <h2>7. Third-Party Services</h2>
      <p>
        The Service relies on third-party services to provide functionality:
      </p>
      <ul>
        <li>
          <strong>Hosting</strong>: {config.services.hosting}
        </li>
        <li>
          <strong>AI Providers</strong>:{" "}
          {config.services.aiProviders.join(", ")}
        </li>
        {paymentProcessors.length > 0 ? (
          <li>
            <strong>Payment Processors</strong>:{" "}
            {paymentProcessors.join(", ")}
          </li>
        ) : null}
      </ul>
      <p>
        These third-party services have their own terms of service and privacy
        policies. Your use of the Service is also subject to the terms and
        policies of these providers to the extent that they apply to the
        processing of your data.
      </p>

      <h2>8. Pricing and Billing</h2>
      {!hasAnyPlan ? (
        <>
          <p>
            {config.appName} is currently offered free of charge. If we
            introduce paid features or subscription plans in the future, this
            section will be updated and you will be notified in advance.
          </p>
          {paymentProcessors.length > 0 ? (
            <p>
              When payments are enabled, billing will be processed by{" "}
              {paymentProcessors.join(", ")}. We will not store payment card
              details; payment data will be handled directly by our payment
              providers.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p>
            {config.appName} offers{" "}
            {hasFree && hasPro
              ? "free and paid"
              : hasPro
                ? "paid"
                : "free"}{" "}
            subscription plans.
          </p>
          <ul>
            {hasFree && (
              <li>
                <strong>{config.pricing?.free?.name}</strong>:{" "}
                {config.pricing?.free?.summary}
              </li>
            )}
            {hasPro && (
              <li>
                <strong>{config.pricing?.pro?.name}</strong>: {currencySymbol}
                {config.pricing?.pro?.monthlyPrice}/month &mdash;{" "}
                {config.pricing?.pro?.summary}
              </li>
            )}
          </ul>
          {paymentProcessors.length > 0 ? (
            <p>
              Billing is processed by {paymentProcessors.join(", ")}.{" "}
              {config.organization.name} does not store payment card details,
              bank information, or other sensitive payment data.
            </p>
          ) : null}
          {hasPro ? (
            <ul>
              <li>Billing is monthly and charged automatically</li>
              <li>All fees are non-refundable except as expressly stated</li>
              <li>We may change prices with 30 days&apos; notice</li>
              <li>You are responsible for applicable taxes</li>
              <li>
                Failed payments may result in suspension or termination of
                your account
              </li>
            </ul>
          ) : null}
        </>
      )}

      <h2>9. Cancellation and Refunds</h2>
      <p>
        You may cancel your account or subscription at any time through your
        account settings or by contacting us. Upon cancellation of a paid
        subscription, your access continues until the end of the current billing
        period, after which your account reverts to the free tier.
      </p>
      <p>
        <strong>Refund Policy</strong>: All subscription fees are final and
        non-refundable unless otherwise required by applicable law.
      </p>

      <h2>10. Privacy</h2>
      <p>
        Your use of the Service is also governed by our{" "}
        <a href="/privacy">Privacy Policy</a>, which is incorporated into these
        Terms by reference. Please review the Privacy Policy to understand how
        we collect, use, and protect your information.
      </p>

      <h2>11. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law,{" "}
        {config.organization.name} and its officers, directors, employees,
        agents, and affiliates shall not be liable for any indirect, incidental,
        special, consequential, or punitive damages, including but not limited
        to loss of profits, data, use, or goodwill, arising out of or in
        connection with your access to or use of (or inability to use) the
        Service, even if we have been advised of the possibility of such
        damages.
      </p>
      <p>
        Our total aggregate liability for any claims arising out of or relating
        to the Service shall not exceed the amount you paid us in the twelve
        (12) months preceding the claim, or one hundred U.S. dollars ($100),
        whichever is greater.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;
        without any warranties of any kind, whether express, implied, or
        statutory. We disclaim all warranties, including but not limited to
        implied warranties of merchantability, fitness for a particular purpose,
        title, and non-infringement. We do not warrant that the Service will be
        uninterrupted, error-free, or secure.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless{" "}
        {config.organization.name} and its officers, directors, employees, and
        agents from and against any claims, liabilities, damages, losses, and
        expenses (including reasonable legal fees) arising out of or in
        connection with your use of the Service, your violation of these Terms,
        or your violation of any rights of another party.
      </p>

      <h2>14. Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time,
        with or without notice, for conduct that we determine, in our sole
        discretion, violates these Terms, is harmful to other users, us, or
        third parties, or for any other reason. Upon termination, your right to
        use the Service ceases immediately.
      </p>

      <h2>15. Governing Law and Dispute Resolution</h2>
      <p>
        These Terms are governed by and construed in accordance with the laws of
        the {config.legal.governingLaw}, without regard to conflict of law
        principles. Any disputes arising out of or relating to these Terms or
        the Service shall be resolved in the courts of the{" "}
        {config.legal.governingLaw}.
      </p>

      <h2>16. Severability</h2>
      <p>
        If any provision of these Terms is found to be unenforceable or invalid,
        that provision shall be limited or eliminated to the minimum extent
        necessary so that the remaining Terms remain in full force and effect.
      </p>

      <h2>17. Entire Agreement</h2>
      <p>
        These Terms, together with our Privacy Policy, constitute the entire
        agreement between you and {config.organization.name} regarding the use
        of the Service and supersede any prior agreements or understandings.
      </p>

      <h2>18. Contact Us</h2>
      <p>
        If you have any questions about these Terms of Service, please contact
        us at:
      </p>
      <ul>
        <li>
          <strong>Email</strong>: {config.organization.contact.legalEmail}
        </li>
        <li>
          <strong>Website</strong>: {config.appUrl}
        </li>
      </ul>

      <p>
        By using {config.appName}, you acknowledge that you have read,
        understood, and agree to be bound by these Terms of Service and our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}
