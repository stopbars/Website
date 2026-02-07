import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { CodeXml, Users, GitBranch } from 'lucide-react';

const Credits = () => {
  const [contributors, setContributors] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const statusRef = useRef(null); // for aria-live updates

  // fallback avatar (local asset or generic placeholder)
  const FALLBACK_AVATAR = '/favicon.png';

  const handleImageError = (e) => {
    if (e.target && e.target.src !== new URL(FALLBACK_AVATAR, window.location.origin).href) {
      e.target.src = FALLBACK_AVATAR;
    }
  };

  const fetchContributors = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://v2.stopbars.com/contributors');

      if (!response.ok) {
        throw new Error(`Failed to fetch contributors: ${response.status}`);
      }

      const data = await response.json();
      setContributors(Array.isArray(data.contributors) ? data.contributors : []);
      setRepositories(Array.isArray(data.repositories) ? data.repositories : []);
      setStatistics(data.statistics || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContributors();
  }, []);

  return (
    <Layout>
      {/* Page Header */}
      <section className="relative pt-39 pb-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-4 flex items-center">
                <CodeXml className="w-8 h-8 sm:w-10 sm:h-10 mr-3 sm:mr-4" />
                GitHub Contributors
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-zinc-300 max-w-2xl">
                BARS is made possible by the dedicated contributors who volunteer their time and
                expertise. Whether it&apos;s code, documentation, testing, or community support,
                every contribution matters.
              </p>
              {/* Status text just below description on mobile, hidden on md+ */}
              <div
                ref={statusRef}
                className="mt-2 mb-2 text-sm text-zinc-500 md:hidden"
                aria-live="polite"
                aria-atomic="true"
              >
                {loading && 'Loading contributors…'}
                {!loading && error && 'Encountered an error while loading contributors.'}
              </div>
            </div>
          </div>
          {/* Status text below header on md+ only */}
          <div
            className="mt-4 text-sm text-zinc-500 hidden md:block"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading && 'Loading contributors…'}
            {!loading && error && 'Encountered an error while loading contributors.'}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        {error && (
          <Card className="p-6 bg-red-950/20 border-red-800/30" role="alert">
            <p className="text-red-400">Error loading contributors: {error}</p>
          </Card>
        )}

        {/* Statistics Overview */}
        {loading && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {[...Array(3)].map((_, i) => (
                <Card
                  key={i}
                  className="p-6 bg-zinc-900/50 border-zinc-700/20 text-center animate-pulse"
                >
                  <div className="h-10 bg-zinc-700 rounded mb-2 w-24 mx-auto"></div>
                  <div className="h-6 bg-zinc-800 rounded w-32 mx-auto"></div>
                </Card>
              ))}
            </div>
          </section>
        )}
        {!loading && contributors.length > 0 && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <Card className="p-6 bg-zinc-900/50 border-green-500/20 text-center hover:bg-zinc-800/50 hover:border-green-500/30 transition-all duration-300">
                <div className="text-4xl font-bold text-green-400 mb-2">
                  {statistics?.totalContributors || contributors.length}
                </div>
                <div className="text-zinc-400 text-lg">Contributors</div>
              </Card>
              <Card className="p-6 bg-zinc-900/50 border-blue-500/20 text-center hover:bg-zinc-800/50 hover:border-blue-500/30 transition-all duration-300">
                <div className="text-4xl font-bold text-blue-400 mb-2">
                  {statistics?.totalRepositories || repositories.length}
                </div>
                <div className="text-zinc-400 text-lg">Repositories</div>
              </Card>
              <Card className="p-6 bg-zinc-900/50 border-purple-500/20 text-center hover:bg-zinc-800/50 hover:border-purple-500/30 transition-all duration-300">
                <div className="text-4xl font-bold text-purple-400 mb-2">
                  {statistics?.totalContributions ||
                    contributors.reduce((sum, contributor) => sum + contributor.contributions, 0)}
                </div>
                <div className="text-zinc-400 text-lg">Total Contributions</div>
              </Card>
            </div>
          </section>
        )}

        {/* Contributors Section */}
        <section aria-labelledby="contributors-heading">
          <h2
            id="contributors-heading"
            className="text-3xl font-semibold mb-12 flex items-center justify-center"
          >
            <Users className="w-8 h-8 mr-4" />
            Our Contributors
          </h2>

          {loading ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
              aria-busy="true"
              aria-label="Loading contributor cards"
            >
              {[...Array(12)].map((_, i) => (
                <Card key={i} className="p-8 bg-zinc-900/80 border-zinc-700/50 animate-pulse">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-zinc-700 rounded-full"></div>
                    <div className="space-y-2 w-full">
                      <div className="h-6 bg-zinc-700 rounded w-3/4 mx-auto"></div>
                      <div className="h-5 bg-zinc-800 rounded w-2/3 mx-auto"></div>
                      <div className="h-4 bg-zinc-800 rounded w-1/2 mx-auto"></div>
                    </div>
                    <div className="w-full space-y-2 pt-2 border-t border-zinc-800">
                      <div className="h-3 bg-zinc-800 rounded w-3/4 mx-auto mb-2"></div>
                      <div className="flex justify-between">
                        <div className="h-4 bg-zinc-700 rounded w-1/2"></div>
                        <div className="h-4 bg-zinc-700 rounded w-8"></div>
                      </div>
                      <div className="flex justify-between">
                        <div className="h-4 bg-zinc-700 rounded w-2/3"></div>
                        <div className="h-4 bg-zinc-700 rounded w-8"></div>
                      </div>
                      <div className="flex justify-between">
                        <div className="h-4 bg-zinc-700 rounded w-1/3"></div>
                        <div className="h-4 bg-zinc-700 rounded w-8"></div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <ul
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
              role="list"
            >
              {contributors.map((contributor) => (
                <li key={contributor.id} className="rounded-lg outline-none">
                  <Card className="p-8 bg-zinc-900/80 border-zinc-700/50 hover:bg-zinc-800/80 hover:border-zinc-600/50 transition-all duration-300 group h-full">
                    <div className="flex flex-col items-center text-center space-y-4">
                      <a
                        href={contributor.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block transition-transform group-hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded-full"
                      >
                        <img
                          src={contributor.avatar_url}
                          alt={`Avatar of ${contributor.login}`}
                          width={80}
                          height={80}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={handleImageError}
                          className="w-20 h-20 rounded-full border-3 border-zinc-700 group-hover:border-zinc-500 transition-all cursor-pointer object-cover"
                        />
                      </a>
                      <div className="space-y-2">
                        <a
                          href={contributor.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded"
                        >
                          <h3 className="text-xl font-semibold text-white group-hover:text-green-400 transition-colors cursor-pointer">
                            {contributor.login}
                          </h3>
                        </a>
                        <div className="flex items-center justify-center space-x-2 text-zinc-300">
                          <GitBranch className="w-4 h-4" aria-hidden="true" />
                          <span className="text-lg font-medium">
                            {contributor.contributions} contribution
                            {contributor.contributions === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          Active in {contributor.repositories.length} repo
                          {contributor.repositories.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div
                        className="w-full space-y-1 pt-2 border-t border-zinc-800"
                        aria-label={`Top repositories for ${contributor.login}`}
                      >
                        <p className="text-xs text-zinc-500 mb-3">Contributions by repository:</p>
                        {contributor.repositories
                          .slice() // shallow copy before sort
                          .sort((a, b) => b.contributions - a.contributions)
                          .slice(0, 3)
                          .map((repo) => (
                            <div
                              key={repo.name}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-zinc-300 truncate" title={repo.name}>
                                {repo.name}
                              </span>
                              <span
                                className="text-zinc-500 font-medium"
                                aria-label={`${repo.contributions} contributions in ${repo.name}`}
                              >
                                {repo.contributions}
                              </span>
                            </div>
                          ))}
                        {contributor.repositories.length > 3 && (
                          <div className="text-xs text-zinc-600 pt-1">
                            +{contributor.repositories.length - 3} more repo
                            {contributor.repositories.length - 3 !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default Credits;
