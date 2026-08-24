import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AlertCircle, ArrowUpRight, FolderGit2, GitCommitHorizontal, Users } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/shared/Button';
import { Card } from '../components/shared/Card';
import { PageLoading } from '../components/shared/PageLoading';

const FALLBACK_AVATAR = '/favicon.png';

const getContributionCount = (contributor) => Number(contributor.contributions ?? 0);

const initialRequestState = {
  contributors: [],
  repositories: [],
  statistics: null,
  loading: true,
  error: '',
};

const requestReducer = (state, action) => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: '' };
    case 'success':
      return { ...action.payload, loading: false, error: '' };
    case 'error':
      return { ...state, loading: false, error: action.message };
    default:
      return state;
  }
};

const handleImageError = (event) => {
  const fallbackUrl = new URL(FALLBACK_AVATAR, window.location.origin).href;
  if (event.currentTarget.src !== fallbackUrl) event.currentTarget.src = FALLBACK_AVATAR;
};

const Credits = () => {
  const [{ contributors, repositories, statistics, loading, error }, dispatch] = useReducer(
    requestReducer,
    initialRequestState
  );
  const requestRef = useRef(null);

  const loadContributors = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    dispatch({ type: 'loading' });

    try {
      const response = await fetch('https://v2.stopbars.com/contributors', {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Contributor request failed with status ${response.status}`);

      const data = await response.json();
      dispatch({
        type: 'success',
        payload: {
          contributors: Array.isArray(data.contributors) ? data.contributors : [],
          repositories: Array.isArray(data.repositories) ? data.repositories : [],
          statistics: data.statistics || null,
        },
      });
    } catch (requestError) {
      if (requestError.name === 'AbortError') return;
      console.error('Error fetching contributors:', requestError);
      dispatch({
        type: 'error',
        message: 'Unable to load contributor data. Check your connection and try again.',
      });
    }
  }, []);

  useEffect(() => {
    void loadContributors();
    const activeRequest = requestRef.current;
    return () => activeRequest?.abort();
  }, [loadContributors]);

  const totals = useMemo(
    () => ({
      contributors: Number(statistics?.totalContributors ?? contributors.length),
      repositories: Number(statistics?.totalRepositories ?? repositories.length),
      contributions: Number(
        statistics?.totalContributions ??
          contributors.reduce((total, contributor) => total + getContributionCount(contributor), 0)
      ),
    }),
    [contributors, repositories.length, statistics]
  );

  if (loading) {
    return (
      <Layout>
        <PageLoading page label="Loading credits…" variant="credits" />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-36 pb-20 sm:pt-40">
        <div className="mx-auto max-w-6xl">
          <header className="mb-12 flex flex-col gap-6 border-b border-zinc-800 pb-10 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold tracking-tight text-white">Credits</h1>
              <p className="mt-4 text-lg leading-8 text-zinc-400">
                BARS is built and maintained by volunteers contributing code across the project.
              </p>
            </div>
            <a
              href="https://github.com/stopbars"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-[background-color,border-color,transform] duration-[var(--duration-quick)] hover:border-zinc-600 hover:bg-zinc-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:self-auto"
            >
              <img src="/GitHub.svg" alt="" className="h-4 w-4" />
              View BARS on GitHub
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </header>

          {error ? (
            <Card className="border-red-500/20 bg-red-500/5 p-6 sm:p-8" role="alert">
              <div className="flex items-start gap-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-white">Unable to load credits</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{error}</p>
                  <Button variant="outline" className="mt-5 px-4 py-2.5" onClick={loadContributors}>
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          ) : contributors.length === 0 ? (
            <Card className="p-8 text-center sm:p-10">
              <Users className="mx-auto h-8 w-8 text-zinc-500" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-white">
                No contributor data available
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
                Retry the request or view the BARS repositories directly on GitHub.
              </p>
              <Button variant="outline" className="mt-6" onClick={loadContributors}>
                Retry
              </Button>
            </Card>
          ) : (
            <>
              <section aria-labelledby="credit-summary-heading">
                <h2 id="credit-summary-heading" className="sr-only">
                  Contribution summary
                </h2>
                <dl className="grid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-3 sm:gap-px">
                  {[
                    { label: 'Contributors', value: totals.contributors },
                    { label: 'Repositories', value: totals.repositories },
                    { label: 'Contributions', value: totals.contributions },
                  ].map((statistic) => (
                    <div key={statistic.label} className="bg-zinc-900 px-6 py-6 sm:py-7">
                      <dt className="text-sm text-zinc-500">{statistic.label}</dt>
                      <dd className="text-3xl font-semibold tracking-tight text-white tabular-nums">
                        {statistic.value.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="mt-16" aria-labelledby="contributors-heading">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <h2 id="contributors-heading" className="text-2xl font-semibold text-white">
                      Project contributors
                    </h2>
                    <p className="mt-2 text-sm text-zinc-500">
                      GitHub activity across BARS repositories.
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-zinc-500">
                    {contributors.length} {contributors.length === 1 ? 'person' : 'people'}
                  </span>
                </div>

                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {contributors.map((contributor) => {
                    const contributorRepositories = Array.isArray(contributor.repositories)
                      ? contributor.repositories
                          .slice()
                          .sort(
                            (a, b) => Number(b.contributions ?? 0) - Number(a.contributions ?? 0)
                          )
                      : [];
                    const contributionCount = getContributionCount(contributor);

                    return (
                      <li key={contributor.id ?? contributor.login}>
                        <a
                          href={contributor.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block h-full rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-[background-color,border-color,transform] duration-[var(--duration-quick)] hover:border-zinc-700 hover:bg-zinc-800/65 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                          aria-label={`View ${contributor.login} on GitHub`}
                        >
                          <div className="flex items-center gap-4">
                            <img
                              src={contributor.avatar_url || FALLBACK_AVATAR}
                              alt=""
                              width={48}
                              height={48}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={handleImageError}
                              className="h-12 w-12 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate font-semibold text-zinc-100 transition-colors duration-[var(--duration-quick)] group-hover:text-white">
                                {contributor.login}
                              </h3>
                              <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
                                <GitCommitHorizontal
                                  className="h-4 w-4"
                                  strokeWidth={1.5}
                                  aria-hidden="true"
                                />
                                <span className="tabular-nums">
                                  {contributionCount.toLocaleString()}{' '}
                                  {contributionCount === 1 ? 'contribution' : 'contributions'}
                                </span>
                              </p>
                            </div>
                            <ArrowUpRight
                              className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-zinc-300"
                              aria-hidden="true"
                            />
                          </div>

                          <div className="mt-5 border-t border-zinc-800 pt-4">
                            <p className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-500">
                              <FolderGit2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Top repositories
                            </p>
                            {contributorRepositories.length > 0 ? (
                              <dl className="space-y-2">
                                {contributorRepositories.slice(0, 3).map((repository) => (
                                  <div
                                    key={repository.name}
                                    className="flex items-center justify-between gap-4 text-sm"
                                  >
                                    <dt
                                      className="min-w-0 truncate text-zinc-400"
                                      title={repository.name}
                                    >
                                      {repository.name}
                                    </dt>
                                    <dd className="shrink-0 font-medium tabular-nums text-zinc-500">
                                      {Number(repository.contributions ?? 0).toLocaleString()}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            ) : (
                              <p className="text-sm text-zinc-500">
                                Repository details unavailable
                              </p>
                            )}
                            {contributorRepositories.length > 3 ? (
                              <p className="mt-3 text-xs text-zinc-600">
                                {contributorRepositories.length - 3} more{' '}
                                {contributorRepositories.length - 3 === 1
                                  ? 'repository'
                                  : 'repositories'}
                              </p>
                            ) : null}
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Credits;
