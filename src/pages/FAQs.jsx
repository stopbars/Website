import { useState, useEffect, useMemo } from 'react';
import useSearchQuery from '../hooks/useSearchQuery';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Search, ChevronLeft, ChevronRight, HelpCircle, AlertCircle } from 'lucide-react';
import { Button } from '../components/shared/Button';

const ITEMS_PER_PAGE = 5;

const FAQPage = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [filteredFaqs, setFilteredFaqs] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const lastUpdated = useMemo(() => {
    if (faqs.length === 0) return null;
    const mostRecent = faqs.reduce((latest, faq) => {
      const faqDate = new Date(faq.updated_at);
      return faqDate > latest ? faqDate : latest;
    }, new Date(faqs[0].updated_at));
    return mostRecent.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [faqs]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/faqs');
        if (!response.ok) throw new Error('Failed to fetch FAQs');
        const data = await response.json();
        const sortedFaqs = data.faqs.sort((a, b) => a.order - b.order);
        setFaqs(sortedFaqs);
        setFilteredFaqs(sortedFaqs);
      } catch (err) {
        setError('Failed to load FAQs. Please try again later.');
        console.error('Error fetching FAQs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  useEffect(() => {
    const filtered = faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredFaqs(filtered);
    setCurrentPage(1); // Reset to first page when search changes
  }, [searchTerm, faqs]);

  const totalPages = Math.ceil(filteredFaqs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentFaqs = filteredFaqs.slice(startIndex, endIndex);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header Section */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3">Frequently Asked Questions</h1>
            {loading ? (
              <div className="h-5 bg-zinc-700/50 rounded-md w-48 mx-auto animate-pulse mt-4"></div>
            ) : lastUpdated ? (
              <span className="text-sm text-zinc-500">Last Updated: {lastUpdated}</span>
            ) : null}
          </div>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto mb-12">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search FAQs..."
                className="w-full pl-12 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 text-white placeholder:text-zinc-500"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            </div>
          </div>

          {/* Main Content */}
          {error ? (
            <Card className="p-12 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-zinc-300 mb-2">Failed to Load FAQs</h3>
              <p className="text-zinc-500">
                We couldn&apos;t load the FAQs at this time, please try again later.
              </p>
            </Card>
          ) : loading ? (
            <div className="space-y-6">
              {[...Array(ITEMS_PER_PAGE)].map((_, index) => (
                <Card key={index} className="animate-pulse">
                  <div className="p-6">
                    <div className="h-6 bg-zinc-700 rounded-md w-3/4 mb-4"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-zinc-700/70 rounded-md w-full"></div>
                      <div className="h-4 bg-zinc-700/70 rounded-md w-4/5"></div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredFaqs.length === 0 ? (
            <Card className="p-12 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
              {faqs.length === 0 ? (
                <>
                  <HelpCircle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No FAQs Found</h3>
                  <p className="text-zinc-500 mb-2">
                    No FAQs were found, please try again later or contact support.
                  </p>
                </>
              ) : (
                <>
                  <HelpCircle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No FAQs Found</h3>
                  <p className="text-zinc-500 mb-2">
                    No results found matching{' '}
                    <span className="font-semibold text-zinc-400">&quot;{searchTerm}&quot;</span>
                  </p>
                </>
              )}
            </Card>
          ) : (
            <>
              <div className="space-y-6">
                {currentFaqs.map((faq) => (
                  <Card key={faq.id} className="transition-all duration-200 hover:shadow-lg">
                    <div className="p-6">
                      <h3 className="text-lg font-medium text-white mb-4">{faq.question}</h3>
                      <div className="text-zinc-400 text-sm">{faq.answer}</div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center space-x-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-2 flex items-center justify-center bg-zinc-800! text-zinc-200! border! border-zinc-700! hover:bg-zinc-700! transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>

                  <div className="flex items-center space-x-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant="secondary"
                        className={`w-14 h-12 flex items-center justify-center border! border-zinc-700! transition-colors duration-200 ${
                          currentPage === page
                            ? 'bg-white! text-black! hover:bg-zinc-200!'
                            : 'bg-zinc-800! text-zinc-200! hover:bg-zinc-700!'
                        }`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="secondary"
                    className="px-3 py-2 flex items-center justify-center bg-zinc-800! text-zinc-200! border! border-zinc-700! hover:bg-zinc-700! transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FAQPage;
