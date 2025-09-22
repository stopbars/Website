import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/shared/Button';
import { getVatsimToken } from '../utils/cookieUtils';
import { Building2, Link, List, LayoutGrid, Loader } from 'lucide-react';

const Divisions = () => {
  const [userDivisions, setUserDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const token = getVatsimToken();
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user's divisions
        const userDivisionsResponse = await fetch('https://v2.stopbars.com/divisions/user', {
          headers: {
            'X-Vatsim-Token': token,
          },
        });

        if (!userDivisionsResponse.ok) throw new Error('Failed to fetch user divisions');
        const userDivisionsData = await userDivisionsResponse.json();
        setUserDivisions(userDivisionsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchData();
  }, [token]);

  const formatRole = (role) => {
    return role
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading)
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader className="w-8 h-8 animate-spin text-zinc-300" />
        </div>
      </Layout>
    );

  if (error)
    return (
      <Layout>
        <div className="min-h-screen pt-40 pb-20 bg-950">
          <div className="max-w-5xl mx-auto px-6">
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg mb-8">
              <p className="text-red-500">{error}</p>
            </div>
          </div>
        </div>
      </Layout>
    );

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20 bg-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-400" />
              <h1 className="text-4xl font-bold text-white">Divisions</h1>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg border transition-colors ${viewMode === 'list' ? 'bg-zinc-800 border-zinc-600 text-zinc-200' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                aria-label="List view"
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg border transition-colors ${viewMode === 'grid' ? 'bg-zinc-800 border-zinc-600 text-zinc-200' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div>
            {userDivisions.length > 0 ? (
              viewMode === 'list' ? (
                <div className="flex flex-col gap-4">
                  {userDivisions.map((userDiv) => {
                    const division = userDiv.division ?? userDiv;
                    const role = userDiv.role;
                    return (
                      division && (
                        <div
                          key={division.id}
                          className="flex flex-col md:flex-row md:items-center justify-between bg-zinc-800/40 rounded-lg border border-zinc-800/50 hover:border-zinc-700 transition-colors duration-200 p-6 w-full"
                        >
                          <div className="mb-4 md:mb-0">
                            <h2 className="text-2xl font-semibold text-white mb-1 truncate">
                              {division.name}
                            </h2>
                            <p className="text-zinc-400">Your Role: {formatRole(role)}</p>
                          </div>
                          <Button
                            variant="primary"
                            onClick={() => navigate(`/divisions/${division.id}/manage`)}
                            className="bg-white text-zinc-900 hover:bg-zinc-100 w-full md:w-auto border border-zinc-300 font-semibold shadow-sm"
                          >
                            <span className="flex items-center justify-center">
                              <Link className="w-4 h-4 mr-2" />
                              Manage Division
                            </span>
                          </Button>
                        </div>
                      )
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userDivisions.map((userDiv) => {
                    const division = userDiv.division ?? userDiv;
                    const role = userDiv.role;
                    return (
                      division && (
                        <div
                          key={division.id}
                          className="flex flex-col justify-between h-full bg-zinc-800/40 rounded-lg border border-zinc-800/50 hover:border-zinc-700 transition-colors duration-200 p-8 group cursor-pointer"
                          style={{ minHeight: '200px' }}
                        >
                          <div>
                            <h2 className="text-2xl font-semibold text-white mb-2 truncate">
                              {division.name}
                            </h2>
                            <p className="text-zinc-400 mb-6">Your Role: {formatRole(role)}</p>
                          </div>
                          <Button
                            variant="primary"
                            onClick={() => navigate(`/divisions/${division.id}/manage`)}
                            className="bg-white text-zinc-900 hover:bg-zinc-100 w-full mt-auto border border-zinc-300 font-semibold shadow-sm"
                          >
                            <span className="flex items-center justify-center">
                              <Link className="w-4 h-4 mr-2" />
                              Manage Division
                            </span>
                          </Button>
                        </div>
                      )
                    );
                  })}
                </div>
              )
            ) : (
              <p className="text-zinc-400">You are not a member of any divisions.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Divisions;
