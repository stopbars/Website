import { useState, useEffect } from 'react';
import { Plane, Monitor, Download, Zap, Building2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import PropTypes from 'prop-types';

const Feature = ({ icon: Icon, title, description }) => (
  <div className="flex items-start space-x-4">
    <Icon className="w-6 h-6 mt-1 text-zinc-400" />
    <div>
      <h3 className="font-medium mb-2">{title}</h3>
      <p className="text-zinc-400 text-sm">{description}</p>
    </div>
  </div>
);

const DownloadButton = ({ asset, icon: Icon, label, variant = "primary", version, downloadCount }) => {
  const handleDownload = async () => {
    if (!asset?.browser_download_url) return;
    
    try {
      let downloadType = 'plugin';
      if (label.toLowerCase().includes('pilot')) {
        downloadType = 'client';
      } else if (label.toLowerCase().includes('euroscope')) {
        downloadType = 'euroscope';
      }
      
      await fetch(`https://api.stopbars.com/downloads/${downloadType}`, {
        method: 'POST'
      });
      window.open(asset.browser_download_url, '_blank');
    } catch (err) {
      console.error('Error downloading:', err);
    }
  };

  return (
    <Button 
      variant={variant}
      onClick={handleDownload}
      className="group relative overflow-hidden h-14 px-5 w-full"
    >
      <div className="absolute left-0 inset-y-0 flex items-center justify-center w-12 border-r border-black/10">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col items-center ml-10">
        <span className="font-medium">{label}</span>
        {asset && (
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <span>v{version}</span>
            <span>•</span>
            <span>{downloadCount?.toLocaleString()}+ downloads</span>
          </div>
        )}
      </div>
    </Button>
  );
};

export const Hero = () => {
  const [releaseInfo, setReleaseInfo] = useState(null);
  const [versionInfo, setVersionInfo] = useState(null);
  const [downloadStats, setDownloadStats] = useState({ client: 0, plugin: 0, euroscope: 0 });
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVersionInfo = async () => {
      try {
        const response = await fetch('https://cdn.stopbars.com/update.xml');
        if (!response.ok) throw new Error('Failed to fetch version information');
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        setVersionInfo({
          pluginVersion: xmlDoc.querySelector('PluginVersion').textContent,
          clientVersion: xmlDoc.querySelector('ClientVersion').textContent,
          eueroscopeVersion: xmlDoc.querySelector('ESPluginVersion').textContent
        });
      } catch (err) {
        console.error('Error fetching version info:', err);
        setError(err.message);
      }
    };

    fetchVersionInfo();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('https://api.stopbars.com/downloads');
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setDownloadStats(data.allTimeDownloads);
      } catch (err) {
        console.error('Error fetching stats:', err);
      }
    };

    fetchStats();
    const intervalId = setInterval(fetchStats, 30000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const fetchReleaseInfo = async () => {
      try {
        const response = await fetch('https://api.stopbars.com/releases');
        if (!response.ok) throw new Error('Failed to fetch release information');
        const data = await response.json();
        setReleaseInfo(data.releases);
      } catch (err) {
        console.error('Error fetching release info:', err);
        setError(err.message);
      }
    };
  
    fetchReleaseInfo();
  }, []);

  const getAssetInfo = (type) => {
    if (!releaseInfo) return null;
    const release = releaseInfo.find(r => r.type === type);
    if (!release) return null;
    
    // Replace spaces with underscores in the file path
    const normalizedFilePath = release.filePath.replace(/\s+/g, '_');
    
    return {
      browser_download_url: `https://cdn.stopbars.com/${normalizedFilePath}`,
      version: release.version
    };
  };

  const clientAsset = getAssetInfo('client');
  const pluginAsset = getAssetInfo('vatsys');
  const euroscopeAsset = getAssetInfo('euroscope');
  return (
    <section className="relative pt-[90px] md:pt-32 pb-12 md:pb-20">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 md:mb-8">
              <span className="text-red-500">Stop Bar</span>
              <br />
              <span className="bg-gradient-to-r from-zinc-200 to-zinc-300 text-transparent bg-clip-text">
                Simulation
              </span>
            </h1>
            <p className="text-lg md:text-xl text-zinc-400 mb-6 md:mb-8 leading-relaxed">
              BARS revolutionizes your VATSIM experience with realistic stopbar operations. 
              Fully compatible with Microsoft Flight Simulator and seamlessly integrated 
              with both default and major third-party sceneries.
            </p>
            {error ? (
              <div className="text-red-500 text-sm">
                Failed to load download information. Please try again later.
              </div>
            ) : releaseInfo && versionInfo ? (
              <div className="space-y-4">
                {/* First Row: Two Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <div className="w-full sm:w-1/2">
                    <DownloadButton 
                      asset={clientAsset}
                      icon={Plane}
                      label="Pilot Client"
                      version={versionInfo.clientVersion}
                      downloadCount={downloadStats.client}
                    />
                  </div>
                  <div className="w-full sm:w-1/2">
                    <DownloadButton
                      asset={euroscopeAsset}
                      icon={Monitor}
                      label="EuroScope Plugin"
                      variant="secondary"
                      version={versionInfo.eueroscopeVersion}
                      downloadCount={downloadStats.euroscope}
                    />
                  </div>
                </div>
                {/* Second Row: Single Button */}
                <div className="flex justify-center">
                  <div className="w-full sm:w-1/2">
                    <DownloadButton 
                      asset={pluginAsset}
                      icon={Monitor}
                      label="vatSys Plugin"
                      variant="secondary"
                      version={versionInfo.pluginVersion}
                      downloadCount={downloadStats.plugin}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="h-14 w-full sm:w-64 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 w-full sm:w-64 bg-zinc-800/80 rounded-lg animate-pulse" />
              </div>
            )}
          </div>
          <Card className="p-4 md:p-8">
            <div className="space-y-6">
              <Feature
                icon={Download}
                title="One-Click Installation"
                description="Simple installer with automatic configuration - no complex setup required."
              />
              <Feature
                icon={Zap}
                title="Smart Integration"
                description="Automatically detects your simulator for perfect compatibility."
              />
              <Feature
                icon={Building2}
                title="Zero Performance Impact"
                description="Optimized design ensures no impact on simulator performance."
              />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

Feature.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired
};

DownloadButton.propTypes = {
  asset: PropTypes.shape({
    browser_download_url: PropTypes.string,
    download_count: PropTypes.number
  }),
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  variant: PropTypes.string,
  version: PropTypes.string,
  downloadCount: PropTypes.number
};

export default Hero;
