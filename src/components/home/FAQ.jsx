import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { PageLoading } from '../shared/PageLoading';

/* oxlint-disable react-doctor/prefer-useReducer react-doctor/no-fetch-in-effect -- FAQ disclosure and request state are independent; the one-shot request owns AbortController cleanup. */
export const FAQ = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    const fetchFaqs = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/faqs', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to fetch FAQs');
        const data = await response.json();
        const sortedFaqs = data.faqs.sort((a, b) => a.order - b.order).slice(0, 5);
        setFaqs(sortedFaqs);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching FAQs:', err);
        setError('Failed to load FAQs');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchFaqs();
    return () => controller.abort();
  }, []);

  return (
    <section className="deferred-section py-24 bg-zinc-900/50" id="faq">
      <div className="max-w-3xl mx-auto px-6">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
        </div>

        {error ? (
          <div className="text-red-500 text-center p-8 bg-red-500/10 rounded-lg border border-red-500/20">
            {error}
          </div>
        ) : loading ? (
          <PageLoading label="Loading homepage content…" />
        ) : (
          <>
            <div className="space-y-4 mb-12">
              {faqs.map((faq, index) => (
                <div
                  key={faq.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    aria-expanded={openFaq === index}
                    aria-controls={`faq-panel-${faq.id}`}
                    className="w-full px-6 py-4 text-left flex justify-between cursor-pointer items-center hover:bg-zinc-800/40 transition-colors duration-200"
                  >
                    <span className="font-medium pr-6">{faq.question}</span>
                    <Plus
                      className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${openFaq === index ? 'rotate-45' : 'rotate-0'}`}
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    id={`faq-panel-${faq.id}`}
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      openFaq === index
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="border-t border-zinc-800 px-6 pb-4 text-zinc-400">
                        <div className="pt-4">{faq.answer}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <Button variant="secondary" onClick={() => navigate('/faq')} className="group">
                View All FAQs
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
