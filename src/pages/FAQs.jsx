import { useState, useEffect } from 'react';
import useSearchQuery from '../hooks/useSearchQuery';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Search, Loader, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/shared/Button';

const ITEMS_PER_PAGE = 5;

const FAQPage = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [filteredFaqs, setFilteredFaqs] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

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
    const filtered = faqs.filter(faq => 
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

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    window.location.reload();
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Find answers to common questions about BARS. Our team is always happy to help! 
              Can&apos;t find what you&apos;re looking for? Feel free to reach out or join our Discord community for support.
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto mb-12">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search FAQs..."
                className="w-full pl-12 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder:text-zinc-500"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            </div>
          </div>

          {/* Main Content */}
          {error ? (
            <Card className="p-8 text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <Button variant="secondary" onClick={handleRetry}>
                <Loader className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </Card>
          ) : loading ? (
            <Card className="p-8">
              <div className="flex items-center justify-center space-x-4">
                <Loader className="w-5 h-5 animate-spin text-zinc-400" />
                <span className="text-zinc-400">Loading FAQs...</span>
              </div>
            </Card>
          ) : filteredFaqs.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-400">
                No FAQs found matching &quot;{searchTerm}&quot;.
              </p>
            </Card>
          ) : (
            <>
              <div className="space-y-6">
                {currentFaqs.map((faq) => (
                  <Card 
                    key={faq.id}
                    className="transition-all duration-200 hover:shadow-lg"
                  >
                    <div className="p-6">
                      <h3 className="text-lg font-medium text-white mb-4">
                        {faq.question}
                      </h3>
                      <div className="text-zinc-400 text-sm">
                        {faq.answer}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center space-x-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-2"
                    onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  
                  <div className="flex items-center space-x-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "primary" : "secondary"}
                        className="w-10 h-10"
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="secondary"
                    className="px-3 py-2"
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