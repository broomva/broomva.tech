import { config } from "@/lib/config";

export default function PrivacyPage() {
  return (
    <main className="prose dark:prose-invert container mx-auto max-w-3xl py-10">
      <h1>{config.policies.privacy.title}</h1>
      {config.policies.privacy.lastUpdated ? (
        <p>
          <strong>Effective date:</strong> {config.policies.privacy.lastUpdated}
        </p>
      ) : null}

      <p>
        At {config.organization.name} (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;), we respect your privacy and are committed to
        protecting your personal data. This Privacy Policy explains how we
        collect, use, disclose, and safeguard your information when you use{" "}
        {config.appName} (the &quot;Service&quot;), including our AI-powered
        chat interface, blog and writing section, and agent skills platform.
      </p>

      <h2>1. Information We Collect</h2>
      <p>We may collect the following types of information:</p>

      <h3>a. Information You Provide</h3>
      <ul>
        <li>
          <strong>Account Information</strong>: Email address, name, and profile
          information when you create an account or sign in via Google or GitHub.
        </li>
        <li>
          <strong>Chat and Query Data</strong>: The messages, questions, and
          prompts you submit through our AI chat interface.
        </li>
        <li>
          <strong>Uploaded Content</strong>: Files, images, and documents you
          upload to the Service.
        </li>
        <li>
          <strong>Writing and Blog Content</strong>: Any content you create or
          interact with in the writing and notes sections.
        </li>
      </ul>

      <h3>b. Information Collected Automatically</h3>
      <ul>
        <li>
          <strong>Usage Data</strong>: Information about how you interact with
          our Service, including features used, pages visited, and time spent on
          the platform.
        </li>
        <li>
          <strong>Device Information</strong>: Browser type, IP address,
          operating system, and device identifiers.
        </li>
        <li>
          <strong>Cookies and Similar Technologies</strong>: We use cookies and
          similar tracking technologies to enhance your experience, remember
          preferences, and collect usage information.
        </li>
      </ul>

      <h3>c. Information from Third-Party Services</h3>
      <ul>
        <li>
          <strong>Authentication Providers</strong>: When you sign in via Google
          or GitHub, we receive basic profile information (name, email, avatar)
          as permitted by your account settings.
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain the Service</li>
        <li>
          Process your queries through AI models and return generated responses
        </li>
        <li>Personalize and improve your experience</li>
        <li>
          Enable features such as deep research, image generation, web search,
          and agent skills
        </li>
        <li>Monitor and analyze usage patterns, trends, and performance</li>
        <li>Detect, prevent, and address technical issues or abuse</li>
        <li>Communicate with you about updates, security alerts, or support</li>
      </ul>

      <h2>3. AI Processing and Data Handling</h2>
      <p>
        When you use the chat interface or AI-powered features,{" "}
        {config.appName} sends your queries to third-party AI providers for
        processing. These providers include{" "}
        {config.services.aiProviders.join(", ")}. Your queries and the
        AI-generated responses may be processed by these providers subject to
        their own privacy policies and data handling practices.
      </p>
      <p>
        We do not use your personal chat content to train our own AI models. The
        third-party AI providers we use may have their own data retention and
        training policies, which we encourage you to review.
      </p>

      <h2>4. Data Sharing and Disclosure</h2>
      <p>We may share your information in the following circumstances:</p>
      <ul>
        <li>
          <strong>AI Processing Partners</strong>: We transmit your queries to
          AI providers including {config.services.aiProviders.join(", ")} to
          process and generate responses.
        </li>
        <li>
          <strong>Hosting Provider</strong>: {config.services.hosting} hosts our
          infrastructure and may process data as part of providing hosting
          services.
        </li>
        <li>
          <strong>Analytics</strong>: We use Vercel Analytics and Speed Insights
          to understand how the Service is used.
        </li>
        {config.services.paymentProcessors.length > 0 ? (
          <li>
            <strong>Payment Processors</strong>: We use{" "}
            {config.services.paymentProcessors.join(", ")} to process payments
            and manage subscriptions. These providers handle all payment data
            directly according to their own privacy policies and security
            standards.
          </li>
        ) : null}
        <li>
          <strong>Compliance with Laws</strong>: When required by applicable law,
          regulation, legal process, or governmental request.
        </li>
        <li>
          <strong>Business Transfers</strong>: In connection with a merger,
          acquisition, reorganization, or sale of assets.
        </li>
        <li>
          <strong>Protection of Rights</strong>: When we believe disclosure is
          necessary to protect the rights, property, or safety of{" "}
          {config.organization.name}, our users, or others.
        </li>
      </ul>
      <p>
        We do not sell your personal information to third parties.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain your personal information for as long as your account is
        active or as needed to provide you the Service. Chat history and
        generated content are retained to enable continued access to your
        conversations. You may request deletion of your data at any time by
        contacting us.
      </p>

      <h2>6. Data Security</h2>
      <p>
        We implement appropriate technical and organizational measures to
        protect your personal information, including encryption in transit
        (TLS/HTTPS) and secure authentication mechanisms. However, no method of
        transmission over the Internet or electronic storage is 100% secure, and
        we cannot guarantee absolute security.
      </p>

      <h2>7. Your Rights</h2>
      <p>Depending on your location, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Request correction of inaccurate personal information</li>
        <li>Request deletion of your personal information</li>
        <li>Object to or restrict certain processing activities</li>
        <li>Data portability (receive your data in a structured format)</li>
        <li>Withdraw consent where applicable</li>
        <li>
          Lodge a complaint with a supervisory authority in your jurisdiction
        </li>
      </ul>
      <p>
        To exercise any of these rights, please contact us at{" "}
        {config.organization.contact.privacyEmail}.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use cookies and similar technologies to maintain your session, store
        preferences (such as theme selection), and collect analytics data. You
        can control cookie settings through your browser. Disabling cookies may
        affect the functionality of the Service.
      </p>

      <h2>9. Third-Party Links</h2>
      <p>
        The Service may contain links to third-party websites or services. We
        are not responsible for the privacy practices of those third parties. We
        encourage you to review the privacy policies of any third-party services
        you access through {config.appName}.
      </p>

      <h2>10. Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to children under the age of{" "}
        {config.legal.minimumAge}. We do not knowingly collect personal
        information from children under {config.legal.minimumAge}. If you are a
        parent or guardian and believe your child has provided us with personal
        information, please contact us and we will take steps to delete such
        information.
      </p>

      <h2>11. International Data Transfers</h2>
      <p>
        Your information may be transferred to and processed in countries other
        than your own. Our hosting provider and AI processing partners may
        operate servers in various jurisdictions. By using the Service, you
        consent to the transfer of your information to these locations.
      </p>

      <h2>12. Changes to This Privacy Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you
        of any material changes by posting the updated Privacy Policy on this
        page and updating the &quot;Effective date&quot; above. Your continued
        use of the Service after any changes constitutes acceptance of the
        updated policy.
      </p>

      <h2>13. Contact Us</h2>
      <p>
        If you have any questions or concerns about this Privacy Policy or our
        data practices, please contact us at:
      </p>
      <ul>
        <li>
          <strong>Email</strong>: {config.organization.contact.privacyEmail}
        </li>
        <li>
          <strong>Website</strong>: {config.appUrl}
        </li>
      </ul>

      <p>
        By using {config.appName}, you acknowledge that you have read and
        understood this Privacy Policy and agree to the collection and use of
        your information as described herein.
      </p>
    </main>
  );
}
