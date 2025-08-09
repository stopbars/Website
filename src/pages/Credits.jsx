import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { 
  Github, 
  Users, 
  GitBranch,
  Heart,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

const Credits = () => {
  const [contributors, setContributors] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
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
    setContributors(Array.isArray(data.contributors) ? data.contributors : []);
    setRepositories(Array.isArray(data.repositories) ? data.repositories : []);
    setStatistics(data.statistics || null);
    setLastUpdated(new Date());
      
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
      <section className="relative pt-32 pb-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-5xl font-bold mb-6 flex items-center">
                <Github className="w-10 h-10 mr-4" />
                GitHub Contributors
              </h1>
              <p className="text-xl text-zinc-300 max-w-2xl">
                Celebrating the amazing developers who contribute to BARS across all our GitHub repositories
              </p>
            </div>
            <Button
              onClick={fetchContributors}
              disabled={loading}
              aria-label={loading ? 'Refreshing contributor list' : 'Refresh contributor list'}
              className="flex items-center space-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
          <div
            ref={statusRef}
            className="mt-4 text-sm text-zinc-500"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading && 'Loading contributors…'}
            {!loading && !error && lastUpdated && `Loaded ${contributors.length} contributor${contributors.length === 1 ? '' : 's'} • Updated at ${lastUpdated.toUTCString()}`}
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
        {!loading && contributors.length > 0 && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <Card className="p-6 bg-zinc-900/50 border-green-500/20 text-center">
                <div className="text-4xl font-bold text-green-400 mb-2">
                  {statistics?.totalContributors || contributors.length}
                </div>
                <div className="text-zinc-400 text-lg">Contributors</div>
              </Card>
              <Card className="p-6 bg-zinc-900/50 border-blue-500/20 text-center">
                <div className="text-4xl font-bold text-blue-400 mb-2">
                  {statistics?.totalRepositories || repositories.length}
                </div>
                <div className="text-zinc-400 text-lg">Repositories</div>
              </Card>
              <Card className="p-6 bg-zinc-900/50 border-purple-500/20 text-center">
                <div className="text-4xl font-bold text-purple-400 mb-2">
                  {statistics?.totalContributions || contributors.reduce((sum, contributor) => sum + contributor.contributions, 0)}
                </div>
                <div className="text-zinc-400 text-lg">Total Contributions</div>
              </Card>
            </div>
          </section>
        )}

        {/* Contributors Section */}
        <section aria-labelledby="contributors-heading">
          <h2 id="contributors-heading" className="text-3xl font-semibold mb-12 flex items-center justify-center">
            <Users className="w-8 h-8 mr-4 text-green-400" />
            Our Amazing Contributors
          </h2>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" aria-busy="true" aria-label="Loading contributor cards">
              {[...Array(9)].map((_, i) => (
                <Card key={i} className="p-8 animate-pulse">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-20 h-20 bg-zinc-700 rounded-full"></div>
                    <div className="space-y-2 text-center w-full">
                      <div className="h-5 bg-zinc-700 rounded w-3/4 mx-auto"></div>
                      <div className="h-4 bg-zinc-800 rounded w-1/2 mx-auto"></div>
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
                            {contributor.contributions} contribution{contributor.contributions === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          Active in {contributor.repositories.length} repo{contributor.repositories.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="w-full space-y-1 pt-2 border-t border-zinc-800" aria-label={`Top repositories for ${contributor.login}`}>
                        <p className="text-xs text-zinc-500 mb-2">Contributions by repository:</p>
                        {contributor.repositories
                          .slice() // shallow copy before sort
                          .sort((a, b) => b.contributions - a.contributions)
                          .slice(0, 3)
                          .map((repo) => (
                            <div key={repo.name} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-300 truncate" title={repo.name}>{repo.name}</span>
                              <span className="text-zinc-500 font-medium" aria-label={`${repo.contributions} contributions in ${repo.name}`}>{repo.contributions}</span>
                            </div>
                        ))}
                        {contributor.repositories.length > 3 && (
                          <div className="text-xs text-zinc-600 pt-1">
                            +{contributor.repositories.length - 3} more repo{contributor.repositories.length - 3 !== 1 ? 's' : ''}
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

        {/* Thank You Section */}
        <section className="text-center">
          <Card className="p-8 bg-zinc-900/60 border-red-500/30">
            <h2 className="text-2xl font-semibold mb-4 flex items-center justify-center">
              <Heart className="w-6 h-6 text-red-500 mr-3" />
              Thank You!
            </h2>
            <p className="text-zinc-300 mb-6 max-w-2xl mx-auto">
              BARS is made possible by the dedicated contributors who volunteer their time and expertise. 
              Whether it&apos;s code, documentation, testing, or community support, every contribution matters.
            </p>
            <div className="flex justify-center space-x-4">
              <Button 
                onClick={() => window.open('https://github.com/stopbars', '_blank')}
                className="group"
              >
                <Github className="w-5 h-5 mr-2" />
                View on GitHub
                <ExternalLink className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </Layout>
  );
};

export default Credits;
