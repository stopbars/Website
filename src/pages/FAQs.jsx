import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/shared/Button';
import { LoadErrorCard } from '../components/shared/LoadErrorCard';
import { Card } from '../components/shared/Card';
import { PageLoading } from '../components/shared/PageLoading';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import useSearchQuery from '../hooks/useSearchQuery';

const ITEMS_PER_PAGE = 5;
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;
const TRAILING_URL_PUNCTUATION = /[),.!?;:]+$/;

const renderAnswerWithLinks = (answer) => {
  const text = String(answer ?? '');
  const parts = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchedUrl = match[0];
    const trailingPunctuation = matchedUrl.match(TRAILING_URL_PUNCTUATION)?.[0] ?? '';
    const url = trailingPunctuation ? matchedUrl.slice(0, -trailingPunctuation.length) : matchedUrl;
    const matchIndex = match.index ?? 0;

    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex));

    const href = /^(?:https?:\/\/)/i.test(url) ? url : `https://${url}`;
    parts.push(
      <a
        key={`${matchIndex}-${url}`}
        href={href}
        className="font-medium text-blue-400 underline decoration-blue-400/45 underline-offset-3 transition-colors duration-[var(--duration-quick)] hover:text-blue-300 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
      >
        {url}
      </a>
    );

    if (trailingPunctuation) parts.push(trailingPunctuation);
    cursor = matchIndex + matchedUrl.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
};

/* oxlint-disable react-doctor/no-high-complexity-react-function react-doctor/no-fetch-in-effect react-doctor/no-loading-flag-reset-outside-finally -- Search, pagination, disclosure state, and the abortable request form one route workflow; identity guards protect the finally reset and Retry reuses it. */
const FAQPage = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [pagination, setPagination] = useState(() => ({ searchTerm, page: 1 }));
  const [openFaqId, setOpenFaqId] = useState(null);
  const requestRef = useRef(null);
  const resultsRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const loadFaqs = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://v2.stopbars.com/faqs', {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`FAQ request failed with status ${response.status}`);

      const data = await response.json();
      const nextFaqs = Array.isArray(data.faqs)
        ? data.faqs.slice().sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
        : [];
      setFaqs(nextFaqs);
    } catch (requestError) {
      if (requestError.name === 'AbortError') return;
      console.error('Error fetching FAQs:', requestError);
      setError('Unable to load FAQs. Check your connection and try again.');
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaqs();
    const activeRequest = requestRef.current;
    return () => activeRequest?.abort();
  }, [loadFaqs]);

  const filteredFaqs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return faqs;

    return faqs.filter(
      (faq) =>
        String(faq.question ?? '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(faq.answer ?? '')
          .toLowerCase()
          .includes(normalizedSearch)
    );
  }, [faqs, searchTerm]);

  const lastUpdated = useMemo(() => {
    const timestamps = faqs.flatMap((faq) => {
      const timestamp = Date.parse(faq.updated_at);
      return Number.isFinite(timestamp) ? [timestamp] : [];
    });
    if (timestamps.length === 0) return '';

    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(Math.max(...timestamps)));
  }, [faqs]);

  const requestedPage = pagination.searchTerm === searchTerm ? pagination.page : 1;
  const totalPages = Math.ceil(filteredFaqs.length / ITEMS_PER_PAGE);
  const currentPage = Math.min(requestedPage, Math.max(totalPages, 1));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentFaqs = filteredFaqs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (page) => {
    setPagination({ searchTerm, page });
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  if (loading) {
    return (
      <Layout>
        <PageLoading page label="Loading FAQs…" variant="faq" />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-36 pb-20 sm:pt-40">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10 max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Frequently asked questions
            </h1>
            <p className="mt-4 text-lg leading-8 text-zinc-400">
              Find answers about installing, using, and contributing to BARS.
            </p>
            {lastUpdated ? (
              <p className="mt-3 text-sm text-zinc-500">Updated {lastUpdated}</p>
            ) : null}
          </header>

          {!error ? (
            <div className="mb-8">
              <label htmlFor="faq-search" className="mb-2 block text-sm font-medium text-zinc-300">
                Search questions
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-500"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <input
                  id="faq-search"
                  name="faq-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by topic or question"
                  className="min-h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 py-3 pr-12 pl-12 text-base text-white outline-none transition-[background-color,border-color,box-shadow] duration-[var(--duration-quick)] placeholder:text-zinc-500 hover:border-zinc-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute top-1/2 right-1.5 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-[background-color,color,transform] duration-[var(--duration-quick)] hover:bg-zinc-800 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                    aria-label="Clear FAQ search"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div ref={resultsRef} className="scroll-mt-28">
            {error ? (
              <LoadErrorCard title="Unable to load FAQs" message={error} onRetry={loadFaqs} />
            ) : filteredFaqs.length === 0 ? (
              <Card className="p-8 text-center sm:p-10">
                <HelpCircle className="mx-auto h-8 w-8 text-zinc-500" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-semibold text-white">
                  {faqs.length === 0 ? 'No FAQs published yet' : `No answers for "${searchTerm}"`}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
                  {faqs.length === 0
                    ? 'Contact support if you need help before the FAQ is published.'
                    : 'Try a shorter search or clear it to browse every question.'}
                </p>
                <div className="mt-6 flex justify-center">
                  {faqs.length === 0 ? (
                    <Link
                      to="/contact"
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-[background-color,border-color,transform] duration-[var(--duration-quick)] hover:border-zinc-600 hover:bg-zinc-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    >
                      Contact support
                    </Link>
                  ) : (
                    <Button variant="outline" onClick={() => setSearchTerm('')}>
                      Clear search
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-medium text-zinc-300">
                    {searchTerm ? 'Matching questions' : 'All questions'}
                  </h2>
                  <output className="text-sm tabular-nums text-zinc-500" aria-live="polite">
                    {filteredFaqs.length} {filteredFaqs.length === 1 ? 'answer' : 'answers'}
                  </output>
                </div>

                <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/55">
                  {currentFaqs.map((faq) => {
                    const isOpen = openFaqId === faq.id;
                    return (
                      <div key={faq.id}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`faq-answer-${faq.id}`}
                          onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                          className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-6 px-5 py-4 text-left transition-colors duration-[var(--duration-quick)] hover:bg-zinc-800/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/45 sm:px-6"
                        >
                          <span className="font-medium leading-6 text-zinc-100">
                            {faq.question}
                          </span>
                          <Plus
                            className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] ${isOpen ? 'rotate-45' : 'rotate-0'}`}
                            aria-hidden="true"
                          />
                        </button>
                        <div
                          id={`faq-answer-${faq.id}`}
                          className={`grid transition-[grid-template-rows,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="border-t border-zinc-800/80 px-5 py-5 text-sm leading-7 whitespace-pre-line text-zinc-400 sm:px-6">
                              {renderAnswerWithLinks(faq.answer)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 ? (
                  <nav
                    className="mt-8 flex items-center justify-between gap-4 border-t border-zinc-800 pt-6"
                    aria-label="FAQ pages"
                  >
                    <Button
                      variant="outline"
                      className="px-3 sm:px-4"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label="Previous FAQ page"
                    >
                      <ChevronLeft className="motion-back h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Previous</span>
                    </Button>
                    <span className="text-sm tabular-nums text-zinc-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      className="px-3 sm:px-4"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label="Next FAQ page"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="motion-forward h-4 w-4" aria-hidden="true" />
                    </Button>
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FAQPage;
