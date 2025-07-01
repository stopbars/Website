import { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { 
  Mail, 
  AlertTriangle, 
  Check,
  Loader,
  MessagesSquare,
  Copy,
  ArrowRight,
  Users,
  ChevronDown,
} from 'lucide-react';

const teamMembers = [
    {
      name: 'Edward M',
      role: 'Lead Developer',
      email: 'edward@stopbars.com',
      image: '/EdwardPFP.png'
    },
    {
      name: 'Charlie H',
      role: 'Product Manager',
      email: 'charlie@stopbars.com',
      image: '/CharliePFP.png'
    }
  ];

const Contact = () => {
  const [selectedTopic, setSelectedTopic] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState('');
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const topicOptions = [
    'Technical Support',
    'Bug Report',
    'Feature Request',
    'Security Concern',
    'Partnership Inquiry',
    'Legal Inquiry',
    'Media Request',
    'Other'
  ];

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
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showTopicDropdown ? 'rotate-180' : ''}`} />
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
                  selectedTopic === topic ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both'
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
    setSuccess('');
    setIsSubmitting(true);

    // Validation
    if (!selectedTopic) {
      setError('Please select a topic');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('https://api.stopbars.com/help-me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          topic: selectedTopic,
          message
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setSuccess('Message sent successfully! We will get back to you soon.');
      setEmail('');
      setMessage('');
      setSelectedTopic('');
      setShowTopicDropdown(false);
    } catch (err) {
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">We&apos;re Here to Help</h1>
            <p className="text-xl text-zinc-400">
              Get in touch with our team
            </p>
          </div>

          {/* Contact Form */}
          <Card className="p-8 mb-12">
            <h2 className="text-2xl font-semibold mb-6">Send us a message</h2>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-red-500">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center space-x-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className="text-emerald-500">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  What do you need help with?
                </label>
                {renderTopicDropdown()}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Your Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 min-h-[200px]"
                  placeholder="Describe in detail what you need help with..."
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
              >
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

            {/* Team Members */}
            <Card className="p-8 mb-12">
            <div className="flex items-center space-x-3 mb-8">
                <Users className="w-6 h-6 text-zinc-400" />
                <h2 className="text-2xl font-semibold">Meet the Team</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
                {teamMembers.map((member) => (
                <div 
                    key={member.email}
                    className="p-6 bg-gradient-to-br from-zinc-800/50 to-transparent rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-all duration-200"
                >
                    <div className="flex items-center space-x-6 mb-6">
                    <img 
                        src={member.image} 
                        alt={member.name}
                        className="w-16 h-16 rounded-full border-2 border-zinc-700"
                    />
                    <div>
                        <h3 className="font-medium text-xl text-white">{member.name}</h3>
                        <p className="text-zinc-400">{member.role}</p>
                    </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-zinc-900/80 rounded-lg hover:bg-zinc-900 transition-colors">
                    <span className="text-zinc-300 font-mono text-sm">{member.email}</span>
                    <button
                        onClick={() => handleCopyEmail(member.email)}
                        className="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-lg"
                    >
                        {copiedEmail === member.email ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                        <Copy className="w-4 h-4" />
                        )}
                    </button>
                    </div>
                </div>
                ))}
            </div>
            </Card>

          {/* Additional Support Options */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Discord Support */}
            <Card className="p-6 hover:border-blue-500/30 transition-all cursor-pointer group"
                  onClick={() => window.open('https://stopbars.com/discord', '_blank')}>
              <div className="flex items-center space-x-3">
                <MessagesSquare className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-colors" />
                <div>
                  <h3 className="font-medium group-hover:text-blue-100 transition-colors">Discord Community</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-zinc-400">Get instant help from our community</span>
                    <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            </Card>

            {/* General Support Email */}
            <Card className="p-6 hover:border-emerald-500/30 transition-all cursor-pointer group">
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                <div>
                  <h3 className="font-medium group-hover:text-emerald-100 transition-colors">Support Email</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-zinc-400">support@stopbars.com</span>
                    <button
                      onClick={() => handleCopyEmail('support@stopbars.com')}
                      className="text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      {copiedEmail === 'support@stopbars.com' ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;