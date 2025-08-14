// Changelog.jsx
import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Loader, AlertTriangle } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked to treat single line breaks as <br> and enable GitHub-flavored markdown.
marked.setOptions({
  breaks: true, // so a single newline becomes a line break
  gfm: true
});

const Changelog = () => {
  const [activeFilters, setActiveFilters] = useState([]);
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter options
  const filterOptions = [
    { id: 'pilot-client', label: 'Pilot Client', productName: 'pilot-client' },
    { id: 'vatsys-plugin', label: 'vatSys Plugin', productName: 'vatsys-plugin' },
    { id: 'euroscope-plugin', label: 'EuroScope Plugin', productName: 'euroscope-plugin' }
  ];

  // Toggle filter (only one at a time)
  const toggleFilter = (filterId) => {
    setActiveFilters(prev => 
      prev.includes(filterId) ? [] : [filterId]
    );
  };

  // Filter releases based on active filter
  const filteredReleases = activeFilters.length === 0 
    ? releases 
    : releases.filter(release => {
        const releaseProduct = release.product?.toLowerCase().replace(/\s+/g, '-');
        return activeFilters.some(filterId => {
          const filter = filterOptions.find(f => f.id === filterId);
          return filter && releaseProduct === filter.productName;
        });
      });

  // Fetch releases from API
  useEffect(() => {
    const fetchReleases = async () => {
      try {
        setLoading(true);
        setError('');
        
        const response = await fetch('https://v2.stopbars.com/releases');
        
        if (!response.ok) {
          throw new Error('Failed to fetch releases');
        }
        
        const data = await response.json();
        
        // Sort releases by creation date (newest first)
        const sortedReleases = (data.releases || []).sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        );
        
        setReleases(sortedReleases);
      } catch (err) {
        console.error('Error fetching releases:', err);
        setError(err.message || 'Failed to fetch releases');
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  // Render markdown with custom processing (same as ReleaseManagement)
  const renderMarkdown = (md) => {
    try {
      // Preprocess custom underline syntaxes before passing to marked.
      // Supports:
      // __text__ => underline
      // __*text*__ => underline + italic
      // __**text**__ => underline + bold
      // __***text***__ => underline + bold + italic
      // Order matters to avoid nested double-processing.
      const preprocess = (raw) => {
        if (!raw) return '';
        let out = raw;
        // Underlined Bold Italic (triple asterisks)
        out = out.replace(/__\*{3}([\s\S]+?)\*{3}__/g, '<u><strong><em>$1</em></strong></u>');
        // Underlined Bold
        out = out.replace(/__\*{2}([\s\S]+?)\*{2}__/g, '<u><strong>$1</strong></u>');
        // Underlined Italic
        out = out.replace(/__\*{1}([\s\S]+?)\*{1}__/g, '<u><em>$1</em></u>');
        // Plain underline (ensure not already handled by excluding asterisk right after __ or before __)
        // Use lookarounds to skip patterns starting/ending with * which were handled above.
        out = out.replace(/__(?!\*)([\s\S]*?)(?<!\*)__/g, '<u>$1</u>');
        return out;
      };
      const preprocessed = preprocess(md);
      const html = marked.parse(preprocessed || '');
      return DOMPurify.sanitize(html);
    } catch {
      return '<p class="text-red-400 text-sm">Failed to render markdown.</p>';
    }
  };

  // Format product name for display
  const formatProductName = (product) => {
    const productMap = {
      'Pilot-Client': 'Pilot Client',
      'vatSys-Plugin': 'vatSys Plugin',
      'EuroScope-Plugin': 'EuroScope Plugin'
    };
    return productMap[product] || product;
  };

  const formatDate = (dateString) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(dateString));
  };

  return (
    <Layout>
      <style jsx>{`
        .markdown-preview h3 {
          color: white !important;
          font-size: 1.125rem !important;
          font-weight: 500 !important;
          margin-top: 2rem !important;
          margin-bottom: 1rem !important;
        }
        .markdown-preview ul {
          list-style-type: disc !important;
          margin-left: 1.5rem !important;
          margin-bottom: 1.5rem !important;
        }
        .markdown-preview li {
          color: rgb(212 212 216) !important;
          margin-bottom: 0.5rem !important;
        }
        .markdown-preview code {
          background-color: rgb(39 39 42) !important;
          color: rgb(212 212 216) !important;
          padding: 0.125rem 0.5rem !important;
          border-radius: 0.25rem !important;
          font-size: 0.875rem !important;
          font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important;
        }
        .markdown-preview p {
          color: rgb(212 212 216) !important;
          margin-bottom: 1rem !important;
        }
        .markdown-preview strong {
          color: white !important;
          font-weight: 600 !important;
        }
        .markdown-preview em {
          font-style: italic !important;
        }
        .markdown-preview u {
          text-decoration: underline !important;
        }
      `}</style>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-semibold">Changelog</h1>
            
            {/* Filter Buttons */}
            <div className="flex gap-3">
              {filterOptions.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => toggleFilter(filter.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeFilters.includes(filter.id)
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-zinc-800 mb-12"></div>

          {/* Changelog Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader className="w-8 h-8 animate-spin text-zinc-400" />
              <span className="ml-3 text-zinc-400">Loading changelog...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Failed to load changelog</h3>
                <p className="text-zinc-400">{error}</p>
              </div>
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                {activeFilters.length > 0 ? (
                  <>
                    <h3 className="text-lg font-medium text-white mb-2">No releases found</h3>
                    <p className="text-zinc-400">No releases match the selected filters</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium text-white mb-2">No releases found</h3>
                    <p className="text-zinc-400">Check back later for updates</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Main Content (Right Side) */}
              <div className="ml-48">
                {filteredReleases.map((release, index) => (
                  <div key={release.id} className={`relative ${index > 0 ? 'mt-20' : ''}`}>
                    {/* Timeline dot positioned relative to this release */}
                    <div className="absolute -left-48 flex items-baseline" style={{ top: '2px' }}>
                      <div className="relative">
                        <div className={`w-3.5 h-3.5 ${index === 0 ? 'bg-green-500' : 'bg-zinc-600'} rounded-full border-2 border-zinc-900 shadow-lg transition-colors duration-300`}></div>
                        {index === 0 && (
                          <>
                            <div 
                              className="absolute inset-0 w-3.5 h-3.5 bg-green-500 rounded-full animate-pulse opacity-50"
                              style={{ animationDuration: '3s' }}
                            ></div>
                            <div 
                              className="absolute -inset-0.5 w-4.5 h-4.5 bg-green-500 rounded-full animate-ping opacity-20"
                              style={{ animationDuration: '3s' }}
                            ></div>
                          </>
                        )}
                        {/* Timeline line connecting to next release */}
                        {index < filteredReleases.length - 1 && (
                          <div 
                            className="absolute left-1.75 w-px bg-zinc-800"
                            style={{ 
                              top: '14px',
                              height: '5rem'
                            }}
                          ></div>
                        )}
                      </div>
                      <div className="text-sm text-zinc-300 font-medium ml-4 whitespace-nowrap" style={{ marginTop: '-2px' }}>
                        {formatDate(release.created_at)}
                      </div>
                    </div>

                    {/* Release content */}
                    <h2 className="text-2xl font-semibold text-white mb-6">
                      {formatProductName(release.product)} v{release.version}
                    </h2>
                    
                    {/* Release Image (only if available) */}
                    {release.image_url && (
                      <div className="mb-6">
                        <img 
                          src={release.image_url}
                          alt={`${formatProductName(release.product)} v${release.version} preview`}
                          className="rounded-lg"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    )}

                    {/* Changelog Details */}
                    {release.changelog && (
                      <div className="mb-12">
                        <article className="markdown-preview prose prose-invert prose-zinc max-w-none">
                          <div 
                            className="text-zinc-300 leading-relaxed space-y-4"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(release.changelog) }}
                            style={{
                              /* Custom markdown styles */
                              fontSize: '0.95rem',
                              lineHeight: '1.7'
                            }}
                          />
                        </article>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Changelog;