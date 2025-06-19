import { useState, useEffect } from 'react';
import { Plus, MinusCircle, ArrowRight } from '../shared/Icons';
import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';

export const FAQ = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await fetch('https://api.stopbars.com/faqs');
        if (!response.ok) throw new Error('Failed to fetch FAQs');
        const data = await response.json();
        // Sort by order and take first 5
        const sortedFaqs = data.faqs
          .sort((a, b) => a.order - b.order)
          .slice(0, 5);
        setFaqs(sortedFaqs);
      } catch (err) {
        console.error('Error fetching FAQs:', err);
        setError('Failed to load FAQs');
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  return (
    <section className="py-24 bg-zinc-900/50" id="faq">
      <div className="max-w-3xl mx-auto px-6">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
        </div>

        {error ? (
          <div className="text-red-500 text-center p-8 bg-red-500/10 rounded-lg border border-red-500/20">
            {error}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center space-x-4 p-8">
            <Loader className="w-5 h-5 animate-spin text-zinc-400" />
            <span className="text-zinc-400">Loading FAQs...</span>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-12">
              {faqs.map((faq, index) => (
                <div 
                  key={faq.id} 
                  className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="font-medium pr-6">{faq.question}</span>
                    {openFaq === index ? 
                      <MinusCircle className="h-5 w-5 text-zinc-400 flex-shrink-0" /> : 
                      <Plus className="h-5 w-5 text-zinc-400 flex-shrink-0" />
                    }
                  </button>
                  {openFaq === index && (
                    <div className="px-6 py-4 text-zinc-400 border-t border-zinc-800">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center">
              <Button 
                variant="secondary"
                onClick={() => navigate('/faq')}
                className="group"
              >
                View All FAQs
                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default FAQ;