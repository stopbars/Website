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
              <p className="text-zinc-300">
                Last updated: February 2, 2025
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Information We Collect</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Account Information</h3>
                  <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                    <li>Email address</li>
                    <li>VATSIM Controller ID (CID)</li>
                    <li>Password (securely hashed)</li>
                    <li>Account creation date</li>
                    <li>Last login timestamp</li>
                    <li>Last password change date</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Usage Data</h3>
                  <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                    <li>Runway claims and stopbar states</li>
                    <li>Download statistics (aggregated)</li>
                    <li>Token regeneration attempts</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">How We Use Your Information</h2>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>To provide and maintain our software and services</li>
                <li>To authenticate your identity and validate controller status</li>
                <li>To manage runway claims and stopbar states</li>
                <li>To prevent abuse through rate limiting</li>
                <li>To generate anonymized usage statistics</li>
                <li>To communicate important updates or changes to our services</li>
                <li>To verify account status for contributions</li>
              </ul>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Data Security</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We implement robust security measures to protect your personal information:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                <li>Passwords are securely hashed using industry-standard cryptographic algorithms</li>
                <li>All data is transmitted securely using encryption</li>
                <li>Multiple layers of security controls including rate limiting</li>
                <li>Regular security audits and updates</li>
                <li>Automatic session management and token expiration</li>
                <li>Emails are verified before allowing access to the api</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Third-Party Services</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We only interact with VATSIM&apos;s API to validate controller status. We do not:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Share your personal data with third parties</li>
                  <li>Sell or rent your personal information</li>
                  <li>Use your data for marketing purposes</li>
                  <li>Store your data on external servers</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Analytics</h2>
            <p className="text-zinc-300">
              We use Google Analytics to understand how visitors interact with our website. 
              This helps us improve our service and user experience. The analytics cookies 
              collect information such as:
            </p>
            <ul className="list-disc pl-6 mt-4 space-y-2 text-zinc-300">
              <li>How you reached our website</li>
              <li>Which pages you visit</li>
              <li>How long you spend on each page</li>
              <li>Technical information like your browser type and screen size</li>
            </ul>
            <p className="mt-4 text-zinc-300">
              We do not collect any personally identifiable information through analytics. 
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
                  You can exercise these rights through your account settings or by contacting us.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Data Retention</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We retain your personal information for as long as you maintain an active account. When you delete your 
                  account, all associated data is permanently removed from our systems, including:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Account information</li>
                  <li>Controller ID associations</li>
                  <li>Authentication tokens</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Children&apos;s Privacy</h2>
              <p className="text-zinc-300">
                Our services are not directed to individuals under the age of 13. We do not knowingly collect personal 
                information from children. If you are a parent or guardian and believe your child has provided us with 
                personal information, please contact us.
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
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <p className="text-zinc-300">
                For any questions about these Terms, please contact us through our Discord community, or via email: <u>support@stopbars.com</u>. We will make every effort to address your concerns promptly and thoroughly.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Cookie Preferences</h2>
              <p className="text-zinc-300 mb-4">
                You can manage your cookie preferences at any time using the button below.
              </p>
              <button 
                onClick={() => setShowConsentBanner(true)} 
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
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