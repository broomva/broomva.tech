import Link from "next/link";
import { config } from "@/lib/config";

export default function PrivacyPage() {
  return (
    <main className="prose dark:prose-invert container mx-auto max-w-3xl py-10">
      <h1>{config.policies.privacy.title}</h1>
      <p>
        <strong>Effective date:</strong> {config.policies.privacy.lastUpdated}
      </p>

      <p>
        This notice explains how <strong>{config.organization.name}</strong>,
        located in Bogotá, Colombia (&quot;Broomva,&quot; &quot;we,&quot; or
        &quot;us&quot;), processes personal data through {config.appName}.
        Broomva is the controller for website, account, support, billing, and
        product-analytics processing described here. A signed business agreement
        may assign a different role for customer-controlled data.
      </p>

      <h2>1. Data we process</h2>
      <ul>
        <li>
          <strong>Account and identity:</strong> name, email, avatar,
          authentication identifiers, organization membership, and account
          settings received from you, Google, GitHub, or Neon Auth.
        </li>
        <li>
          <strong>Content:</strong> prompts, chats, generated responses, files,
          images, documents, notes, feedback, and tool inputs and results.
        </li>
        <li>
          <strong>Billing:</strong> plan, subscription status, transaction
          identifiers, invoices, and limited payment metadata from Stripe. Full
          payment-card details are handled by Stripe.
        </li>
        <li>
          <strong>Technical and security:</strong> IP address, device and
          browser information, timestamps, request and error records, abuse
          signals, authentication events, and diagnostic traces.
        </li>
        <li>
          <strong>Onchain identity:</strong> if you use Base account features,
          wallet address, signed authentication message, network identifiers,
          and related public blockchain records.
        </li>
        <li>
          <strong>Optional analytics:</strong> pages and features used, referral
          and campaign parameters, and performance measurements, only after you
          accept optional analytics where the consent control is shown.
        </li>
        <li>
          <strong>Communications:</strong> support requests and other messages
          you send us.
        </li>
      </ul>
      <p>
        Please do not include highly sensitive personal data, secrets, or
        regulated records in prompts or uploads unless a specific feature and
        written agreement expressly support that use.
      </p>

      <h2>2. Purposes and legal grounds</h2>
      <ul>
        <li>
          <strong>Provide the Service and bill paid plans:</strong> performance
          of a contract or steps you request before entering one.
        </li>
        <li>
          <strong>
            Authenticate, secure, debug, prevent abuse, and improve core
            reliability:
          </strong>{" "}
          performance of the contract and our legitimate interests in operating
          a secure, reliable service, balanced against your rights.
        </li>
        <li>
          <strong>Optional product and performance analytics:</strong> your
          consent where required. You may refuse or withdraw without losing core
          access.
        </li>
        <li>
          <strong>Support and service communications:</strong> contract
          performance and our legitimate interests in responding and operating
          the Service.
        </li>
        <li>
          <strong>Taxes, legal requests, disputes, and compliance:</strong>
          applicable legal obligations and legitimate interests in establishing
          or defending legal claims.
        </li>
      </ul>
      <p>
        Colombian processing is also governed by Law 1581 of 2012 and its
        implementing rules. Where consent is the applicable authorization, you
        may request proof of it and withdraw it subject to lawful exceptions.
      </p>

      <h2>3. AI and tool processing</h2>
      <p>
        When you invoke an AI model or tool, Broomva transmits the prompt,
        relevant conversation context, attachments, and tool parameters needed
        to produce the result. Requests may pass through Vercel AI Gateway and
        the model or tool provider you select. Available providers can change;
        the current categories are listed on our{" "}
        <Link href="/subprocessors">Subprocessors page</Link>.
      </p>
      <p>
        Broomva does not use private chat content to train its own public AI
        model. That statement does not promise zero retention by every provider.
        Provider retention, abuse monitoring, and training treatment depend on
        the configured product and contract. Avoid submitting information that
        the selected feature is not intended to process.
      </p>

      <h2>4. Recipients and service providers</h2>
      <p>
        We disclose data only as needed to operate the Service, at your
        direction, to complete a transaction, to professional advisers under
        confidentiality, to comply with law, to protect rights and safety, or in
        a business transfer. Core provider categories include Vercel for hosting
        and AI gateway services, Neon for database and authentication, Stripe
        for billing, Sentry for essential error monitoring, and selected AI and
        tool providers. Browser-based PostHog and Vercel analytics run only
        after the optional analytics choice described below. Limited
        authenticated product, account, model/tool, organization, marketplace,
        and billing events may also be sent server-side to PostHog to understand
        adoption, feature reliability, and commercial operations under our
        service-data authorization and, where applicable, our legitimate
        interests. These events are not the legal record of your Terms
        acceptance or data authorization. You may object by contacting us; we
        will assess and honor the objection where required.
      </p>
      <p>
        Langfuse may receive model, chat, user, trace, and (depending on active
        telemetry settings) prompt or output data for service observability.
      </p>
      <p>
        We do not sell personal data. We do not use optional analytics for
        cross-context behavioral advertising.
      </p>

      <h2>5. Retention</h2>
      <p>
        We retain account and content data while your account is active and for
        a reasonable period afterward to support restoration, security, fraud
        prevention, disputes, and legal obligations. Billing and tax records may
        be kept for the legally required period. Security and error logs are
        retained for operationally limited periods. Optional analytics follow
        the provider configuration then in effect. Backups are overwritten on
        scheduled cycles and may not be immediately editable.
      </p>
      <p>
        We are validating a record-level retention schedule. Until it is
        published, you may ask for the applicable period or criterion at{" "}
        {config.organization.contact.privacyEmail}. We will erase or anonymize
        data when no purpose or legal basis remains. Account cancellation alone
        is not necessarily an erasure request.
      </p>
      <p>
        Acceptance receipts are decoupled from the active account record so
        account deletion does not automatically destroy proof of contract and
        data authorization. They are retained only while reasonably needed for
        that evidentiary purpose or a legal claim, subject to applicable
        minimization, deletion, and objection rights. The final period and
        treatment of receipt IP and user-agent fields remain part of the
        retention-schedule review.
      </p>

      <h2>6. Cookies and analytics</h2>
      <p id="cookies-and-analytics">
        Essential cookies and local storage support authentication, security,
        preferences, and your analytics choice. Optional PostHog and Vercel
        analytics are disabled until you select &quot;Accept analytics.&quot; If
        you select &quot;Essential only,&quot; those browser analytics do not
        load. Use the persistent &quot;Cookie choices&quot; control to change or
        withdraw your choice. Withdrawing affects future collection and does not
        make prior lawful processing unlawful.
      </p>
      <p>
        Sentry error and performance telemetry is treated as essential for
        reliability and security. Browser session replay is disabled and default
        personal-information collection is disabled. An error report can still
        contain technical request context; do not place secrets in URLs or other
        technical fields.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Broomva operates from Colombia and providers may process data in the
        United States and other countries. Use of the Service is not treated as
        blanket consent to every transfer. We are validating provider roles,
        destinations, and the contracts or other safeguards required for each
        restricted transfer. This notice does not itself prove that standard
        clauses, transfer assessments, or supplementary measures are complete.
        Contact us before submitting EU, UK, or other restricted customer data
        if you require evidence of a specific transfer safeguard.
      </p>

      <h2>8. Your choices and rights</h2>
      <p>
        Depending on applicable law, you may request access, a copy, correction,
        updating, deletion, restriction, objection, or portability; withdraw
        consent; ask for proof of authorization; obtain information about use;
        and complain to a competent authority. In Colombia, you may complain to
        the Superintendencia de Industria y Comercio after completing any
        required direct consultation or claim process with us.
      </p>
      <p>
        Send a request to {config.organization.contact.privacyEmail} with enough
        information to identify the account and request. We may verify identity.
        We will acknowledge and answer within the time required by the law that
        applies, explain lawful denials, and notify relevant recipients of
        corrections or erasure where required. You may appeal or complain to
        your local authority. We do not discriminate for exercising a right.
      </p>

      <h2>9. Security and incidents</h2>
      <p>
        We use measures including encrypted transport, access controls, secure
        authentication, tenant-scoped authorization controls, monitoring, and
        vulnerability handling. No Internet service is perfectly secure. See the{" "}
        <Link href="/security">Security page</Link> to report a vulnerability.
        If an incident triggers a legal notification duty, we will notify the
        competent authority and affected people as required.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed to children under {config.legal.minimumAge}{" "}
        and we do not knowingly collect their data. A higher age or guardian
        authorization may apply where you live. Contact us if you believe a
        child provided data so we can investigate and take appropriate action.
      </p>

      <h2>11. Automated decisions</h2>
      <p>
        The general chat and agent features generate content but are not
        intended to make decisions about people that produce legal or similarly
        significant effects. Do not deploy the Service for such decisions
        without a separate assessment and written agreement.
      </p>

      <h2>12. Onchain and file-storage limitations</h2>
      <p>
        Public blockchains are independently replicated. If you use a Base
        feature, Broomva can address its offchain account records but cannot
        erase a valid transaction or identifier already written to the public
        Base blockchain.
      </p>
      <p>
        New attachment uploads and generated-image storage are currently
        disabled while private, signed-access storage is implemented. Earlier
        public-by-link blob objects, if any, require a separate inventory and
        revocation review. Do not rely on an old blob URL as confidential
        storage.
      </p>

      <h2>13. Changes and contact</h2>
      <p>
        We may update this notice as data flows or law change. We will post the
        effective date and provide reasonable notice of material changes. Where
        new consent is required, continued use alone will not substitute for it.
      </p>
      <p>
        Controller and privacy contact: {config.organization.name}, Bogotá,
        Colombia; {config.organization.contact.privacyEmail}; {config.appUrl}.
      </p>
    </main>
  );
}
