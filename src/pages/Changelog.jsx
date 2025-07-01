// Changelog.jsx
import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { 
  Plane, 
  Monitor,
  Loader,
  AlertTriangle,
  Clock,
  Tag,
  BadgeCheck  
} from 'lucide-react';

const Changelog = () => {
  const [releases, setReleases] = useState({
    client: [],
    vatsys: [],
    euroscope: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('client');

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    try {
      const response = await fetch('https://api.stopbars.com/releases');
      if (!response.ok) throw new Error('Failed to fetch releases');
      
      const data = await response.json();
      
      const organized = data.releases.reduce((acc, release) => {
        if (!acc[release.type]) acc[release.type] = [];
        acc[release.type].push(release);
        return acc;
      }, {});

      setReleases(organized);
    } catch (err) {
      setError('Failed to load release information');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(dateString));
  };

  const tabs = [
    { id: 'client', label: 'Pilot Client', icon: Plane },
    { id: 'vatsys', label: 'vatSys Plugin', icon: Monitor },
    { id: 'euroscope', label: 'EuroScope Plugin', icon: Monitor }
  ];

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-4">
              <h1 className="text-3xl font-bold">Changelog</h1>
            </div>
            <p className="text-zinc-400">
              Track all changes and improvements to BARS components
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-500">{error}</p>
            </div>
          )}

          {/* Component Tabs */}
          <Card className="p-4 mb-8">
            <div className="flex space-x-4">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'primary' : 'secondary'}
                  onClick={() => setActiveTab(tab.id)}
                  disabled={tab.comingSoon}
                  className={`flex-1 ${activeTab === tab.id ? 'shadow-lg shadow-blue-500/10' : ''}`}
                >
                  <tab.icon className="w-4 h-4 mr-2" />
                  <span>{tab.label}</span>
                  {tab.comingSoon && (
                    <span className="ml-2 text-xs bg-zinc-800 px-2 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </Card>

          {/* Releases */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {releases[activeTab]?.sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
              ).map((release, index) => (
                <Card 
                  key={release.id}
                  className={`p-6 hover:border-zinc-700 transition-all duration-200 
                    ${index === 0 ? 'bg-gradient-to-b from-blue-500/5 to-transparent' : ''}`}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-medium">{release.name}</h3>
                        <div className="px-2 py-1 bg-zinc-800 rounded-full flex items-center">
                          <Tag className="w-4 h-4 text-zinc-400 mr-1" />
                          <span className="text-sm text-zinc-400">v{release.version}</span>
                        </div>
                        {index === 0 && (
                          <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center">
                            <BadgeCheck className="w-4 h-4 text-emerald-400 mr-1" />
                            <span className="text-sm text-emerald-400">Latest</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-zinc-500">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(release.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {release.notes}
                  </div>
                </Card>
              ))}

              {(!releases[activeTab] || releases[activeTab].length === 0) && (
                <Card className="p-6 text-center">
                  <AlertTriangle className="w-6 h-6 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400">No releases available yet</p>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Changelog;