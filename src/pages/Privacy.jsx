import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { ConsentBanner } from '../components/shared/ConsentBanner';
import { useState } from 'react';

const Privacy = () => {
  const [showConsentBanner, setShowConsentBanner] = useState(false);
  return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Overview</h2>
              <p className="text-zinc-300 mb-4">
                This Privacy Policy describes how BARS (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and protects your information 
                when you use our software and services. We are committed to protecting your privacy and handling your data 
                in a transparent and secure manner.
              </p>
              <p className="text-zinc-300 mb-2">
                Data controller: Edward Mitchell (BARS). Contact: <u>edward@stopbars.com</u>.
              </p>
              <p className="text-zinc-300 mb-2">
                This policy applies globally. For users in the EEA/UK, we process personal data in accordance with GDPR/UK GDPR. For California residents, we provide the disclosures required by the California Privacy Rights Act (CPRA).
              </p>
              <p className="text-zinc-300">
                Last updated: September 6, 2025
              </p>
              <p className="text-zinc-300 mt-4">
                We store your full name as provided by VATSIM because it is required to support our display name system and
                certain features of the website (for example, contribution attribution and moderation workflows).
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Information We Collect</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Account Information</h3>
                  <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                      <li>VATSIM ID</li>
                      <li>Email address (from VATSIM on sign-in)</li>
                      <li>Full name</li>
                      <li>Display preferences: display mode and display name</li>
                      <li>Region, division, and subdivision identifiers and names</li>
                      <li>Personal API key and last regeneration timestamp</li>
                      <li>Account creation and last login timestamps</li>
                  </ul>
                  <p className="text-zinc-300 mt-2">
                    Storing your full name enables accurate display names, proper attribution of contributions, and certain
                    account features that depend on your verified identity.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Usage Data</h3>
                  <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                    <li>Realtime lighting state exchanged via WebSocket sessions</li>
                    <li>Download statistics (aggregated counters)</li>
                    <li>API key regeneration attempts (aggregate)</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">How We Use Your Information</h2>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>To provide and maintain our software and services</li>
                <li>To authenticate your identity and validate controller status</li>
                <li>To operate realtime lighting state for supported airports</li>
                <li>To prevent abuse through rate limiting</li>
                <li>To generate anonymized usage statistics</li>
                <li>To communicate important updates or changes to our services</li>
                <li>To verify account status for contributions</li>
              </ul>
              <div className="mt-4 text-zinc-300">
                <h3 className="text-lg font-medium mb-2">Legal Bases (EEA/UK)</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Performance of a contract: account, authentication, provision of Services</li>
                  <li>Legitimate interests: service reliability, security, rate limiting, preventing abuse</li>
                  <li>Consent: website analytics (PostHog) and cookies where required</li>
                  <li>Legal obligations: responding to lawful requests and protecting our rights</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Data Security</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We implement robust security measures to protect your personal information:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>All data is transmitted securely using HTTPS/WSS</li>
                  <li>Multiple layers of security controls including rate limiting and role-based access</li>
                  <li>Regular security updates and dependency maintenance</li>
                  <li>Short‑lived VATSIM tokens; per-user API keys for clients</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Third-Party Services</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We use VATSIM&apos;s API for authentication and Cloudflare for hosting. Website analytics use PostHog Cloud EU and are opt‑in only.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>We do not sell your personal information</li>
                  <li>No marketing trackers; analytics run only with consent</li>
                  <li>Infrastructure is hosted on Cloudflare (Workers, D1, R2, Durable Objects)</li>
                  <li>Map tiles are provided by OpenStreetMap (street) and Mapbox (satellite); these providers receive your IP and user‑agent when tiles are fetched</li>
                  <li>Donations and payments, if any, are processed by Open Collective; we do not store payment details</li>
                  <li>The only cookies we set are PostHog analytics cookies (when you have consented); other session/local data is stored using your browser&apos;s local storage or session storage, not cookies</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Analytics</h2>
            <p className="text-zinc-300">
              We use PostHog Cloud EU for website analytics. Analytics are <strong>disabled by default</strong> and only enabled after you consent in the cookie banner. We honor Global Privacy Control (GPC) and Do Not Track (DNT).
            </p>
            <p className="mt-4 text-zinc-300">
              When consent is denied or unknown, analytics are disabled and no cookies persist. When consent is granted, we enable standard usage analytics and session recording with masked inputs. The only cookies we use are PostHog analytics cookies; all other client-side session or preference data is stored in your browser&apos;s local storage or session storage rather than cookies.
            </p>
            <p className="mt-4 text-zinc-300">
              You can change your analytics preference at any time using the button below or the link in the footer.
            </p>
          </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">International Transfers</h2>
              <p className="text-zinc-300">
                We use global infrastructure (Cloudflare). PostHog analytics are configured to EU hosting. Where personal data is transferred internationally, we use Standard Contractual Clauses (SCCs) or equivalent safeguards where legally required. Data may be transferred as needed to operate the service with appropriate safeguards.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Your Rights and Choices</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  You have the following rights regarding your personal information:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access and view your personal information</li>
                  <li>Update or correct your personal information</li>
                  <li>Delete your account and associated data</li>
                  <li>Request a copy of your data</li>
                  <li>Opt-out of communications</li>
                </ul>
                <p>
                  You can exercise these rights through your account settings or by contacting us at <u>support@stopbars.com</u>. We will respond within 30 days where required by law and will verify your identity before fulfilling access or deletion requests. We will request only the minimum information necessary to verify your identity. This may include providing valid legal identification.
                </p>
                <div>
                  <h3 className="text-lg font-medium mb-2">EEA/UK</h3>
                  <p>You also have the right to object to processing based on legitimate interests and to withdraw consent at any time (without affecting prior processing).</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">California (CPRA)</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Right to know/access and portability</li>
                    <li>Right to delete and correct</li>
                    <li>Right to limit use of sensitive personal information (we do not collect sensitive PI)</li>
                    <li>Right to non‑discrimination for exercising your rights</li>
                  </ul>
                  <p className="mt-2">We do not &quot;sell&quot; or &quot;share&quot; your personal information as defined by CPRA and do not use or disclose your information for cross‑context behavioral advertising.</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Data Retention</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We retain your information while your account is active. When you delete your account, your personal account information and associated data are permanently deleted from our active systems, except where retention is legally required. Deletion applies to active systems; some backups may persist temporarily until rotated out, but are not accessible or used. Local files and logs on your device are under your control.
                </p>
                <p>
                  For download statistics, we use a hashed IP approach (SHA‑256) to count unique downloads within a 24‑hour window per product/version. We retain aggregate counters only.
                </p>
                <p>
                  For contact messages, we store your submission (subject/message) and a hashed IP address (SHA‑256) solely to rate‑limit repeat submissions from the same IP over 24 hours. We do not retain the plaintext IP.
                </p>
                <p>
                  Operational logs (e.g., WebSocket connection metadata) are retained for a short period necessary for troubleshooting and security (typically up to 30 days) and then deleted or aggregated.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Children&apos;s Privacy</h2>
              <p className="text-zinc-300">
                Our services are not directed to individuals under the age required to hold a VATSIM account. Underage users are not permitted on VATSIM. We do not knowingly collect personal information from children under 13, and for EEA/UK users, under the digital consent age applicable in their country (13–16). If you are a parent or guardian and believe your child has provided us with personal information or holds a VATSIM account in violation of age requirements, please contact us. If we receive a credible report of an underage user, we will terminate the BARS account and inform VATSIM. We will not knowingly maintain data of underage users; if discovered, it will be deleted promptly.
              </p>
            </Card>
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Changes to This Policy</h2>
              <p className="text-zinc-300">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
                Privacy Policy on this page and updating the &quot;Last updated&quot; date. Continued use of our services after such 
                changes constitutes acceptance of the updated policy.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Breach Notification</h2>
              <p className="text-zinc-300">
                In the event of a data breach affecting your personal information, we will inform all affected users promptly
                via their registered VATSIM email address and take appropriate steps to mitigate and remediate the incident in
                accordance with applicable law, within the timeframe required by applicable law (for example, within 72 hours under GDPR where applicable).
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <p className="text-zinc-300">
                For privacy questions or rights requests, contact <u>support@stopbars.com</u>. Security reports: <u>edward@stopbars.com</u> (PGP key in repository root on GitHub).
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Cookie Preferences</h2>
              <p className="text-zinc-300 mb-4">
                You can manage your analytics cookie preferences at any time using the button below.
              </p>
              <button 
                onClick={() => setShowConsentBanner(true)} 
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded cursor-pointer"
              >
                Manage Cookie Settings
              </button>
              
            </Card>

          </div>
        </div>
      </div>
      <ConsentBanner show={showConsentBanner} setShow={setShowConsentBanner} />
    </Layout>
  );
};

export default Privacy;