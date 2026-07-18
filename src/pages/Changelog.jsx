// Changelog.jsx
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Dropdown } from '../components/shared/Dropdown';
import { PageLoading } from '../components/shared/PageLoading';
import { AlertTriangle } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked to treat single line breaks as <br> and enable GitHub-flavored markdown.
marked.use({
  breaks: true, // so a single newline becomes a line break
  gfm: true,
});

const FILTER_PARAM = 'product';

const filterOptions = [
  { id: 'pilot-client', label: 'Pilot Client' },
  { id: 'vatsys-plugin', label: 'vatSys Plugin' },
  { id: 'euroscope-plugin', label: 'EuroScope Plugin' },
  { id: 'simconnect.net', label: 'SimConnect.NET' },
  { id: 'installer', label: 'Installer' },
];

const validFilterIds = new Set(filterOptions.map((opt) => opt.id));

const isValidFilter = (value) => validFilterIds.has(value);
const normalizeProduct = (product) => (product || '').toLowerCase().replace(/\s+/g, '-');
const PRODUCT_NAMES = {
  'Pilot-Client': 'Pilot Client',
  'vatSys-Plugin': 'vatSys Plugin',
  'EuroScope-Plugin': 'EuroScope Plugin',
  'SimConnect.net': 'SimConnect.net',
  Installer: 'Installer',
};
const RELEASE_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const formatProductName = (product) => PRODUCT_NAMES[product] || product;
const formatDate = (dateString) => RELEASE_DATE_FORMATTER.format(new Date(dateString));
const renderMarkdown = (markdown) => {
  try {
    if (!markdown) return '';
    let output = markdown;
    output = output.replace(/__\*{3}([\s\S]+?)\*{3}__/g, '<u><strong><em>$1</em></strong></u>');
    output = output.replace(/__\*{2}([\s\S]+?)\*{2}__/g, '<u><strong>$1</strong></u>');
    output = output.replace(/__\*{1}([\s\S]+?)\*{1}__/g, '<u><em>$1</em></u>');
    output = output.replace(/__(?!\*)([\s\S]*?)(?<!\*)__/g, '<u>$1</u>');
    return DOMPurify.sanitize(marked.parse(output));
  } catch {
    return '<p class="text-red-400 text-sm">Failed to render markdown.</p>';
  }
};

// This page is a cohesive timeline; splitting it is a non-mechanical layout refactor.
// oxlint-disable react-doctor/no-giant-component
const Changelog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFilterParam = (searchParams.get(FILTER_PARAM) || '').toLowerCase();
  const activeFilter = isValidFilter(currentFilterParam) ? currentFilterParam : '';
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lineHeights, setLineHeights] = useState([]); // dynamic heights for connector lines

  // Refs to each release block for measuring distances
  const releaseRefs = useRef([]);

  // Handle selection via dropdown
  const handleSelectFilter = (value) => {
    const normalized = value && value !== '__all__' ? value.toLowerCase() : '';
    const nextFilter = isValidFilter(normalized) ? normalized : '';
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (nextFilter) params.set(FILTER_PARAM, nextFilter);
      else params.delete(FILTER_PARAM);
      return params;
    });
  };

  const currentFilterLabel = () => {
    if (!activeFilter) return 'All Products';
    const f = filterOptions.find((o) => o.id === activeFilter);
    return f ? f.label : 'All Products';
  };

  // Filter releases based on active filter
  const filteredReleases = useMemo(
    () =>
      !activeFilter
        ? releases
        : releases.filter((release) => normalizeProduct(release.product) === activeFilter),
    [activeFilter, releases]
  );

  // Fetch releases from API
  // The one-shot request is cancelled on unmount.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    const controller = new AbortController();
    const fetchReleases = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await fetch('https://v2.stopbars.com/releases', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch releases');
        }

        const data = await response.json();

        // Sort releases by creation date (newest first)
        const sortedReleases = (data.releases || []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        setReleases(sortedReleases);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching releases:', err);
        setError(err.message || 'Failed to fetch releases');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchReleases();
    return () => controller.abort();
  }, []);

  // Function to calculate dynamic line heights between timeline dots
  const calculateLineHeights = () => {
    try {
      const refs = releaseRefs.current;
      if (!refs.length) {
        setLineHeights([]);
        return;
      }
      const newHeights = [];
      for (let i = 0; i < refs.length - 1; i++) {
        const current = refs[i];
        const next = refs[i + 1];
        if (!current || !next) {
          newHeights.push(0);
          continue;
        }
        const currentDot = current.querySelector('.timeline-dot');
        const nextDot = next.querySelector('.timeline-dot');
        if (!currentDot || !nextDot) {
          newHeights.push(0);
          continue;
        }
        const currRect = currentDot.getBoundingClientRect();
        const nextRect = nextDot.getBoundingClientRect();
        // Distance from bottom of current dot to top of next dot
        const distance = nextRect.top - currRect.top - currRect.height;
        newHeights.push(distance > 0 ? distance : 0);
      }
      setLineHeights(newHeights);
    } catch (e) {
      // Fail silently – lines just won't show
      console.warn('Failed to compute timeline line heights', e);
    }
  };

  // Recalculate after layout changes (initial load, filtering, window resize)
  useLayoutEffect(() => {
    // Use rAF to ensure DOM is painted (particularly after images load)
    const id = requestAnimationFrame(() => calculateLineHeights());
    return () => cancelAnimationFrame(id);
  }, [filteredReleases]);

  useEffect(() => {
    const handleResize = () => {
      calculateLineHeights();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Layout>
      <style>{`
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
      <div className="min-h-screen pt-38 md:pt-40 pb-20">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header Section */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-8">
            <h1 className="text-3xl sm:text-4xl font-semibold">Changelog</h1>

            {/* Filter Dropdown */}
            <div className="w-full sm:w-56 sm:mt-1">
              <Dropdown
                options={[
                  { value: '__all__', label: 'All Products' },
                  ...filterOptions.map((opt) => ({ value: opt.id, label: opt.label })),
                ]}
                value={activeFilter || '__all__'}
                onChange={handleSelectFilter}
                placeholder="All Products"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-zinc-800 mb-12"></div>

          {/* Changelog Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <PageLoading label="Loading changelog…" />
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
              <div className="p-12 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center max-w-2xl mx-auto">
                <AlertTriangle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-300 mb-2">No Releases Found</h3>
                {activeFilter ? (
                  <p className="text-zinc-500 mb-2">
                    No releases match the selected filter
                    {` "${currentFilterLabel()}"`}.
                  </p>
                ) : (
                  <p className="text-zinc-500 mb-2">
                    No releases were found, please try again later or contact support.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Main Content (Right Side) */}
              <div className="md:ml-48">
                {filteredReleases.map((release, index) => (
                  <div
                    key={release.id}
                    ref={(element) => {
                      releaseRefs.current[index] = element;
                    }}
                    className={`relative ${index > 0 ? 'mt-12 md:mt-20' : ''}`}
                  >
                    {/* Timeline dot — hidden on mobile, shown md+ */}
                    <div
                      className="hidden md:flex absolute -left-48 items-baseline"
                      style={{ top: '2px' }}
                    >
                      <div className="relative">
                        <div
                          className={`timeline-dot w-3.5 h-3.5 ${index === 0 ? 'bg-green-500' : 'bg-zinc-600'} rounded-full border-2 border-zinc-900 shadow-lg transition-colors duration-300`}
                        ></div>
                        {index === 0 && (
                          <div
                            className="absolute -inset-0.5 w-4.5 h-4.5 bg-green-500 rounded-full animate-ping opacity-15"
                            style={{ animationDuration: '4s' }}
                          ></div>
                        )}
                        {/* Timeline line connecting to next release */}
                        {index < filteredReleases.length - 1 && (
                          <div
                            className="absolute left-1.75 w-px bg-zinc-800 transition-[height] duration-300 ease-out"
                            style={{
                              top: '14px',
                              height: lineHeights[index] || 0,
                            }}
                          ></div>
                        )}
                      </div>
                      <div
                        className="text-sm text-zinc-300 font-medium ml-4 whitespace-nowrap"
                        style={{ marginTop: '-2px' }}
                      >
                        {formatDate(release.created_at)}
                      </div>
                    </div>

                    {/* Mobile date — shown below md */}
                    <p className="md:hidden text-sm text-zinc-400 font-medium mb-2">
                      {formatDate(release.created_at)}
                    </p>

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
                          onLoad={calculateLineHeights}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            calculateLineHeights();
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
                              lineHeight: '1.7',
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
// oxlint-enable react-doctor/no-giant-component

export default Changelog;
