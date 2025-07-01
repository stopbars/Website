import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';

const Terms = () => {
  return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-3xl font-bold mb-8">Terms of Use</h1>
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Overview</h2>
              <div className="space-y-4">
                <p className="text-zinc-300">
                  These Terms of Use (&quot;Terms&quot;) govern your access to and use of BARS software and services. By using BARS, 
                  you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not use our services.
                </p>
                <div className="p-4 bg-zinc-800/50 rounded-lg">
                  <p className="text-zinc-300">
                    <strong>Important Notice:</strong> BARS is an independent third-party software project. We are not affiliated with, 
                    endorsed by, or connected to VATSIM, vatSys, EuroScope Microsoft Flight Simulator, or any other simulation, controller client 
                    supported by our software. All respective trademarks, logos, and brand names are the property of their respective owners.
                  </p>
                </div>
              </div>
              <p className="text-zinc-300 mt-6">
                Last updated: January 29, 2025
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Account Registration</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  To use BARS, you must:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Be at least 13 years of age</li>
                  <li>Register with a valid email address</li>
                  <li>Provide a valid VATSIM Controller ID</li>
                  <li>Create and maintain a secure password</li>
                  <li>Provide accurate and truthful information</li>
                </ul>
                <p>
                  You are responsible for maintaining the confidentiality of your account credentials and for all activities 
                  that occur under your account.
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
                  <li>Interfere with or disrupt the service or servers</li>
                  <li>Share your account credentials with others</li>
                  <li>Create multiple accounts to circumvent rate limits</li>
                  <li>Impersonate other users or VATSIM controllers</li>
                  <li>Automate or script interactions with the service</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Rate Limiting</h2>
              <div className="space-y-4 text-zinc-300">
                <p>To ensure fair usage, we implement the following rate limits:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Maximum 5 login attempts per 15 minutes</li>
                  <li>One account creation per IP address per day</li>
                  <li>One token regeneration per account per day</li>
                  <li>Maximum 1 password reset request per day</li>
                  <li>Maximum 1 verification token request per 15 minutes</li>
                </ul>
                <p>
                  Attempting to circumvent these limits may result in temporary or permanent account suspension.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Communications</h2>
              <p className="text-zinc-300">
                By using BARS, you consent to receive non-marketing emails related to your BARS experience. These may include 
                security alerts, account notifications, feature updates, and other important service-related communications.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Software License</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  BARS is provided free of charge for personal, non-commercial use. We grant you a limited, non-exclusive, 
                  non-transferable license to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Download and install the BARS client software</li>
                  <li>Use the software for its intended purpose</li>
                  <li>Make copies for backup purposes</li>
                </ul>
                <p>
                  You may not modify, decompile, or create derivative works of the software.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Intellectual Property</h2>
              <p className="text-zinc-300">
                The BARS software, including but not limited to its source code, design, logos, and documentation, is 
                protected by intellectual property rights. You may not use our intellectual property without express 
                written permission.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Disclaimer of Warranties</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  BARS is provided &quot;as is&quot; without any warranties, express or implied. We do not warrant that:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The service will be uninterrupted or error-free</li>
                  <li>Defects will be corrected</li>
                  <li>The service is free of viruses or other harmful components</li>
                  <li>The service will meet your specific requirements</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Limitation of Liability</h2>
              <p className="text-zinc-300">
                To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, 
                consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or 
                indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use 
                of our services.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Service Modifications</h2>
              <p className="text-zinc-300">
                We reserve the right to modify, suspend, or discontinue any part of our services at any time without 
                prior notice. We may also impose limits on certain features or restrict access to parts or all of the 
                service without notice or liability.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Account Termination</h2>
              <div className="space-y-4 text-zinc-300">
                <p>
                  We may suspend or terminate your account at our sole discretion, without prior notice or liability, 
                  for any reason, including but not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violation of these Terms</li>
                  <li>Suspicious or fraudulent activity</li>
                  <li>Extended periods of inactivity</li>
                  <li>Abuse of rate limits or system resources</li>
                  <li>Actions that negatively impact other users</li>
                </ul>
                <p>
                  Upon termination, your right to use the service will immediately cease. All provisions of these Terms 
                  that by their nature should survive termination shall survive.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Changes to Terms</h2>
              <p className="text-zinc-300">
                We reserve the right to modify these Terms at any time. We will notify users of any material changes by 
                posting the new Terms on this page and updating the &quot;Last updated&quot; date. Your continued use of the service 
                after such changes constitutes acceptance of the new Terms.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Governing Law</h2>
              <p className="text-zinc-300">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which 
                BARS operates, without regard to its conflict of law provisions. Our failure to enforce any right or 
                provision of these Terms will not be considered a waiver of those rights.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Severability</h2>
              <p className="text-zinc-300">
                If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions 
                of these Terms will remain in effect. These Terms constitute the entire agreement between us regarding our 
                service and supersede any prior agreements we might have.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <p className="text-zinc-300">
                For any questions about these Terms, please contact us through our Discord community, or via email: <u>support@stopbars.com</u>. We will make every effort to address your concerns promptly and thoroughly.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Terms;