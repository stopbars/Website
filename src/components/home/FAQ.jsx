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
        setError('FAQs could not be loaded. Refresh the page to try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchFaqs();
    return () => controller.abort();
  }, []);

  return (
    <section className="deferred-section home-section home-section-band" id="faq">
      <div className="home-shell">
        <div className="mx-auto max-w-3xl">
          <div className="home-section-header text-center">
            <h2 className="home-section-title">Frequently asked questions</h2>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-300">
              {error}
            </div>
          ) : loading ? (
            <PageLoading label="Loading FAQs…" variant="faq-list" />
          ) : (
            <>
              <div className="mb-10 space-y-4">
                {faqs.map((faq, index) => (
                  <div key={faq.id} className="home-panel overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(openFaq === index ? null : index)}
                      aria-expanded={openFaq === index}
                      aria-controls={`faq-panel-${faq.id}`}
                      className="flex w-full cursor-pointer items-center justify-between px-6 py-5 text-left transition-colors duration-[var(--duration-quick)] hover:bg-zinc-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/45"
                    >
                      <span className="pr-6 font-medium">{faq.question}</span>
                      <Plus
                        className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] ${openFaq === index ? 'rotate-45' : 'rotate-0'}`}
                        aria-hidden="true"
                      />
                    </button>
                    <div
                      id={`faq-panel-${faq.id}`}
                      className={`grid transition-[grid-template-rows,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] ${
                        openFaq === index
                          ? 'grid-rows-[1fr] opacity-100'
                          : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="border-t border-zinc-800 px-6 pb-5 leading-relaxed text-zinc-400">
                          <div className="pt-5">{faq.answer}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center">
                <Button variant="secondary" onClick={() => navigate('/faq')} className="group">
                  View all FAQs
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
