import { memo, useState, useRef, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Dropdown } from '../components/shared/Dropdown';
import { Toast } from '../components/shared/Toast';
import { IconSwap } from '../components/shared/IconSwap';
import { Mail, AlertTriangle, Check, Loader, MessagesSquare, Copy, ArrowRight } from 'lucide-react';

const topicOptions = [
  'Technical Support',
  'Bug Report',
  'Feature Request',
  'VATSIM Division',
  'Trust and Safety',
  'Other',
];

const SupportOptions = memo(function SupportOptions() {
  const [copiedEmail, setCopiedEmail] = useState('');
  const copyResetTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    },
    []
  );

  const handleCopyEmail = async (email) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = setTimeout(() => setCopiedEmail(''), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card
        className="group cursor-pointer p-6 transition-[border-color,transform] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:border-blue-500/30 active:scale-[0.96]"
        onClick={() => window.open('https://stopbars.com/discord', '_blank', 'noopener,noreferrer')}
      >
        <div className="flex items-center space-x-3">
          <MessagesSquare className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-colors" />
          <div>
            <h3 className="font-medium group-hover:text-blue-100 transition-colors">
              Discord Community
            </h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-zinc-400">Get instant help from our community</span>
              <ArrowRight className="motion-forward h-4 w-4 text-zinc-500 transition-colors duration-[var(--duration-quick)] group-hover:text-blue-400" />
            </div>
          </div>
        </div>
      </Card>

      <Card
        className="group cursor-pointer p-6 transition-[border-color,transform] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:border-emerald-500/30 active:scale-[0.96]"
        onClick={() => handleCopyEmail('support@stopbars.com')}
      >
        <div className="flex items-center space-x-3">
          <Mail className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
          <div>
            <h3 className="font-medium group-hover:text-emerald-100 transition-colors">
              Support Email
            </h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-zinc-400">support@stopbars.com</span>
              <IconSwap active={copiedEmail === 'support@stopbars.com'}>
                <Copy className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-emerald-400" />
                <Check className="h-4 w-4 text-emerald-400" />
              </IconSwap>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
});

/* oxlint-disable react-doctor/no-giant-component, react-doctor/prefer-useReducer, react-doctor/no-render-in-render -- The cohesive contact and support page is JSX-heavy; form states are independent, and the topic renderer is stateless. */
const Contact = () => {
  const [selectedTopic, setSelectedTopic] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const formRef = useRef(null);
  const emailRef = useRef(null);
  const messageRef = useRef(null);

  // Render topic dropdown
  const renderTopicDropdown = () => {
    return (
      <Dropdown
        id="contact-topic"
        value={selectedTopic}
        onChange={setSelectedTopic}
        options={topicOptions.map((topic) => ({ value: topic, label: topic }))}
        placeholder="Select a topic"
        aria-label="Contact topic"
      />
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    // Validation
    if (!selectedTopic) {
      setError('Please select a topic');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('https://v2.stopbars.com/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: emailRef.current?.value || '',
          topic: selectedTopic,
          message: messageRef.current?.value || '',
        }),
      });

      const data = await response.json();

      if (response.status === 429) {
        setErrorTitle('Rate Limited');
        setErrorMessage('You can only submit one message every 24 hours');
        setShowErrorToast(true);
        setIsSubmitting(false);
        return;
      }

      if (response.status === 400) {
        setErrorTitle('Invalid Content');
        setErrorMessage('Your message must be 5-4000 characters');
        setShowErrorToast(true);
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        setErrorTitle(data.error || 'Error');
        setErrorMessage(data.message || 'Failed to send message, please try again.');
        setShowErrorToast(true);
        setIsSubmitting(false);
        return;
      }

      setShowSuccessToast(true);
      formRef.current?.reset();
      setSelectedTopic('');
    } catch (err) {
      setErrorTitle('Error');
      setErrorMessage(err.message || 'Failed to send message, please try again.');
      setShowErrorToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Get In Touch</h1>
            <p className="text-zinc-400">
              Have a question or feedback? We&apos;d love to hear from you.
            </p>
          </div>

          {/* Contact Form */}
          <Card className="p-6 mb-12">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="contact-topic"
                  className="block text-sm font-medium mb-1.5 text-zinc-300"
                >
                  Topic
                </label>
                {renderTopicDropdown()}
              </div>

              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-sm font-medium mb-1.5 text-zinc-300"
                >
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  ref={emailRef}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-sm"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-sm font-medium mb-1.5 text-zinc-300"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  ref={messageRef}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 min-h-[120px] text-sm"
                  placeholder="How can we help?"
                  required
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Message'
                )}
              </Button>
            </form>
          </Card>

          {/* Additional Support Options */}
          <SupportOptions />
        </div>
      </div>

      {/* Toast notifications */}
      <Toast
        title="Message sent successfully"
        description="We will get back to you soon."
        variant="success"
        show={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
      />

      <Toast
        title={errorTitle}
        description={errorMessage}
        variant="destructive"
        show={showErrorToast}
        onClose={() => setShowErrorToast(false)}
      />
    </Layout>
  );
};

export default Contact;
