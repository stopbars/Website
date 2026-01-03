import { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import {
  Mail,
  AlertTriangle,
  Check,
  Loader,
  MessagesSquare,
  Copy,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';

const topicOptions = [
  'Technical Support',
  'Bug Report',
  'Feature Request',
  'VATSIM Division',
  'Other',
];

const Contact = () => {
  const [selectedTopic, setSelectedTopic] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState('');
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const dropdownRef = useRef(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowTopicDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCopyEmail = async (email) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(''), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  // Render topic dropdown
  const renderTopicDropdown = () => {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowTopicDropdown(!showTopicDropdown)}
          className="flex items-center justify-between w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750"
        >
          <span className={selectedTopic ? 'text-white' : 'text-zinc-500'}>
            {selectedTopic || 'Select a topic'}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${showTopicDropdown ? 'rotate-180' : ''}`}
          />
        </button>

        {showTopicDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
            {topicOptions.map((topic, index) => (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  setSelectedTopic(topic);
                  setShowTopicDropdown(false);
                }}
                className={`w-full px-4 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${
                  selectedTopic === topic
                    ? 'bg-zinc-700 text-blue-400'
                    : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both',
                }}
              >
                {topic}
              </button>
            ))}
          </div>
        )}
      </div>
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
          email,
          topic: selectedTopic,
          message,
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
      setEmail('');
      setMessage('');
      setSelectedTopic('');
      setShowTopicDropdown(false);
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-zinc-300">Topic</label>
                {renderTopicDropdown()}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-zinc-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-sm"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-zinc-300">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
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
          <div className="grid md:grid-cols-2 gap-6">
            {/* Discord Support */}
            <Card
              className="p-6 hover:border-blue-500/30 transition-all cursor-pointer group"
              onClick={() =>
                window.open('https://stopbars.com/discord', '_blank', 'noopener,noreferrer')
              }
            >
              <div className="flex items-center space-x-3">
                <MessagesSquare className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-colors" />
                <div>
                  <h3 className="font-medium group-hover:text-blue-100 transition-colors">
                    Discord Community
                  </h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-zinc-400">
                      Get instant help from our community
                    </span>
                    <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-blue-400 transition-all" />
                  </div>
                </div>
              </div>
            </Card>

            {/* General Support Email */}
            <Card
              className="p-6 hover:border-emerald-500/30 transition-all cursor-pointer group"
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
                    {copiedEmail === 'support@stopbars.com' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <Toast
        title="Message sent successfully"
        description="Your message has successfully been sent, we will get back to you soon."
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
