import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';

const Terms = () => {
  return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Overview</h2>
              <div className="space-y-4">
                <p className="text-zinc-300">
                  These Terms of Service (&quot;Terms&quot;) govern your access to and use of the
                  BARS software and services (the &quot;Services&quot;). By using the Services, you
                  agree to be bound by these Terms. If you disagree with any part of these Terms, do
                  not use the Services.
                </p>
                <div className="p-4 bg-zinc-800/50 rounded-lg">
                  <p className="text-zinc-300">
                    <strong>Important Notice:</strong> BARS is an independent third-party software
                    project. We are not affiliated with, endorsed by, or connected to VATSIM,
                    vatSys, EuroScope, Microsoft Flight Simulator, or any other simulator or
                    controller client, supported by our software. All respective trademarks, logos,
                    and brand names are the property of their respective owners.
                  </p>
                </div>
                <p className="text-zinc-300">
                  Operator: BARS is operated by Edward Mitchell. Contact: <u>edward@stopbars.com</u>
                  .
                </p>
              </div>
              <p className="text-zinc-300 mt-6">Last updated: September 6, 2025</p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Definitions</h2>
              <div className="space-y-2 text-zinc-300">
                <p>
                  <strong>&quot;Services&quot;</strong> means the BARS website, APIs, WebSocket
                  services, software clients/plugins, and related content we make available.
                </p>
                <p>
                  <strong>&quot;User Content&quot;</strong> means content you submit or upload to
                  the Services, including lighting packages, XML data, and messages.
                </p>
                <p>
                  <strong>&quot;Account&quot;</strong> means your BARS account authenticated via
                  VATSIM OAuth and any associated API key(s).
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Realtime Services</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  Controllers and observers may connect to realtime services over WebSockets using
                  an API key and airport identifier. We may log operational metadata necessary to
                  maintain reliability and security and may disconnect clients that appear inactive,
                  abusive, or misconfigured.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Community Contributions</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  You may submit lighting packages and related content. You represent and warrant
                  that you have all rights necessary to submit the content and that your submission
                  does not infringe any third-party rights.
                </p>
                <p>
                  You retain ownership of your submissions. By submitting User Content, you grant
                  BARS a worldwide, non-exclusive, royalty‑free, transferable, and sublicensable
                  license to use, host, reproduce, modify, adapt, create derivative works from,
                  publicly perform, publicly display, and distribute your User Content in connection
                  with the Services and community packages. You may revoke your submission at any
                  time by contacting us; upon revocation, we will cease distributing your User
                  Content in future releases and within our services. Revocation applies
                  prospectively only—existing versions or packages already distributed may continue
                  to include your contribution. We may moderate, approve, deny, or remove
                  submissions at our discretion.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Software Releases & Downloads</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  Client software (Pilot‑Client, controller plugins) is provided &quot;as is&quot;
                  without warranties. We may collect aggregate download statistics (e.g., product,
                  version, counts) to improve releases and support.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Third‑Party Services</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  BARS relies on third‑party services such as Cloudflare, VATSIM, PostHog (opt‑in
                  analytics), Discord, GitHub, and map tile providers (OpenStreetMap and Mapbox).
                  Their terms and privacy policies also apply where relevant.
                </p>
                <p>
                  Donations and payments, if any, are processed by Open Collective. We do not store
                  your payment details; your use of Open Collective is governed by their terms and
                  privacy policy.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Eligibility & Accounts</h2>
              <div className="space-y-4 text-zinc-300">
                <p>To use BARS, you must:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Be eligible to hold and use a VATSIM account and comply with VATSIM rules</li>
                  <li>Sign in via VATSIM OAuth</li>
                  <li>
                    Keep your API key(s) confidential and use them only with supported clients
                  </li>
                </ul>
                <p>
                  You are responsible for activity under your API key. You can regenerate it from
                  the Account page.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Acceptable Use</h2>
              <div className="space-y-4 text-zinc-300">
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Use the service for any illegal purpose</li>
                  <li>Attempt to gain unauthorized access to any part of the service</li>
                  <li>
                    Interfere with or disrupt the service or servers (e.g., abusive load, protocol
                    misuse)
                  </li>
                  <li>Share your API key or use another person’s key</li>
                  <li>Impersonate others or misrepresent your affiliation</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Authentication & API Keys</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  Website sign‑in uses VATSIM OAuth. Client plugins connect using your personal BARS
                  API key. API tokens contain no sensitive personal information; they are random
                  identifiers used solely for authentication and authorization. You can regenerate
                  your key (with a cooldown) from the Account page; prior keys are revoked. If a
                  breach occurs on BARS’ side that may affect token security, we will automatically
                  revoke and regenerate all user tokens and notify affected users.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                Service Availability; No SLA; Force Majeure
              </h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  The Services may change, be interrupted, or be unavailable from time to time. No
                  service level commitments are provided. We are not responsible for delays or
                  failures due to events beyond our reasonable control, including but not limited to
                  acts of God, internet or telecom failures, power outages, labor disputes,
                  governmental actions, or third‑party service issues.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Beta & Experimental Features</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  From time to time we may make beta or experimental features available. Such
                  features are provided for evaluation, may change or be withdrawn at any time, and
                  may be less stable or reliable. Feedback you provide about beta features may be
                  used by us without restriction.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Communications</h2>
              <p className="text-zinc-300">
                By using BARS, you consent to receive non-marketing emails related to your BARS
                experience. These may include security alerts, account notifications, feature
                updates, and other important service-related communications.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Software License</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  Many BARS services and clients are open source and released across multiple
                  repositories. Each repository may have a different license (for example, MIT,
                  Apache-2.0, or other OSI-approved licenses). Your rights to use, modify, and
                  redistribute code are governed by the specific license file in that repository.
                  Where code is open source, contributions are welcomed under the applicable
                  license.
                </p>
                <p>
                  Some components, assets, or trademarks may be proprietary and are provided for use
                  with BARS only. Those items are not licensed for reuse outside BARS unless
                  expressly stated. Please refer to each repository’s LICENSE file and notices for
                  definitive terms.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Intellectual Property</h2>
              <p className="text-zinc-300">
                The BARS software, including but not limited to its source code, design, logos, and
                documentation, is protected by intellectual property rights. You may not use our
                intellectual property without express written permission.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Disclaimer of Warranties</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  To the maximum extent permitted by law and subject to the Australian Consumer Law
                  (ACL), the Services are provided &quot;as is&quot; and &quot;as available&quot;
                  without warranties of any kind, express or implied. We do not warrant that:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The service will be uninterrupted or error-free</li>
                  <li>Defects will be corrected</li>
                  <li>The service is free of viruses or other harmful components</li>
                  <li>The service will meet your specific requirements</li>
                </ul>
                <p>
                  Nothing in these Terms excludes, restricts or modifies any consumer guarantees,
                  rights or remedies conferred by the ACL or any other applicable law that cannot be
                  excluded, restricted or modified by agreement.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Limitation of Liability</h2>
              <p className="text-zinc-300">
                To the maximum extent permitted by law, and subject to non‑excludable rights under
                the ACL, we shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages, or any loss of profits or revenues, whether
                incurred directly or indirectly, or any loss of data, use, goodwill, or other
                intangible losses, arising out of or related to your use of the Services. Our
                aggregate liability for all claims relating to the Services shall not exceed AUD
                $100.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Indemnification</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  You agree to indemnify, defend, and hold harmless BARS and its contributors from
                  and against any claims, liabilities, damages, losses, and expenses (including
                  reasonable legal fees) arising out of or related to: (a) your use of the Services;
                  (b) your User Content; or (c) your violation of these Terms or applicable law.
                </p>
                <p>
                  Likewise, BARS agrees to indemnify you against third‑party claims to the extent
                  caused by BARS’s willful misconduct or violation of applicable law in providing
                  the Services, subject to the limitations and exclusions set forth in these Terms.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Service Modifications</h2>
              <p className="text-zinc-300">
                We reserve the right to modify, suspend, or discontinue any part of our services at
                any time without prior notice. We may also impose limits on certain features or
                restrict access to parts or all of the service without notice or liability.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Account Termination</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We may suspend or terminate your account at our sole discretion, for any reason,
                  including but not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violation of these Terms</li>
                  <li>Suspicious or fraudulent activity</li>
                  <li>Extended periods of inactivity</li>
                  <li>Abuse of rate limits or system resources</li>
                  <li>Actions that negatively impact other users</li>
                </ul>
                <p>
                  When feasible, we will notify you of suspensions or terminations at the email
                  associated with your VATSIM account, though delivery cannot be guaranteed. Serious
                  violations or misuse of the platform (including attempts to bypass security,
                  disrupt services, harass users, or evade enforcement) may result in temporary or
                  permanent account bans. Ban evasion is prohibited and may lead to extended or
                  permanent restrictions across related services and will be enforced globally
                  across BARS software and services.
                </p>
                <p>
                  If you believe an enforcement action was made in error, you may appeal by
                  contacting support at
                  <u> support@stopbars.com</u>. Appeals can be made by email, and final decisions
                  remain at BARS’ discretion. We will review appeals in good faith but are not
                  obligated to reinstate access.
                </p>
                <p>
                  Upon termination, your right to use the service will immediately cease. All
                  provisions of these Terms that by their nature should survive termination shall
                  survive.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Export Controls & Sanctions</h2>
              <p className="text-zinc-300">
                You represent that you are not located in, and will not use the Services in, any
                embargoed or sanctioned country and are not a prohibited party under applicable
                export control laws. You agree to comply with all applicable export and sanctions
                laws and regulations.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Changes to Terms</h2>
              <p className="text-zinc-300">
                We may modify these Terms at any time. If we make material changes, we will post the
                updated Terms and update the &quot;Last updated&quot; date above. Your continued use
                of the Services constitutes acceptance of the updated Terms.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Governing Law & Disputes</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  These Terms are governed by the laws of Western Australia, without regard to
                  conflict of laws principles. You agree to the exclusive jurisdiction of the courts
                  located in Western Australia for any disputes arising out of or relating to these
                  Terms or the Services.
                </p>
                <p>
                  Before commencing any formal proceedings, you agree to first attempt to resolve
                  the dispute informally by contacting us at <u>support@stopbars.com</u>. If we
                  cannot resolve the dispute within 30 days, either party may pursue available
                  remedies in the agreed forum. Nothing in this section limits any non‑excludable
                  rights under the Australian Consumer Law. Enforcement actions (such as bans or
                  restrictions) apply globally to your use of BARS software and services, not
                  limited by geography.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">General</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  If any provision of these Terms is held to be invalid or unenforceable, the
                  remaining provisions will remain in full force and effect. Our failure to enforce
                  any right or provision will not be a waiver of such right or provision.
                </p>
                <p>
                  You may not assign or transfer these Terms without our prior written consent. We
                  may assign these Terms in connection with a reorganization, merger, asset
                  transfer, or by operation of law.
                </p>
                <p>
                  These Terms constitute the entire agreement between you and us regarding the
                  Services.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Payments & Refunds</h2>
              <p className="text-zinc-300">
                Donations and payments made through Open Collective are subject to Open Collective’s
                refund policies and terms. BARS does not process refunds directly and does not
                guarantee refunds beyond Open Collective’s policy.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <p className="text-zinc-300">
                For any questions about these Terms, please contact us through our Discord
                community, or via email: <u>support@stopbars.com</u>. For legal notices, contact:{' '}
                <u>edward@stopbars.com</u>.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Terms;
