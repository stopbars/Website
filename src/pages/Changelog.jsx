// Changelog.jsx
import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Search } from 'lucide-react';

const Changelog = () => {
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data for the changelog
  const mockChangelog = {
    id: 1,
    date: '2025-08-10',
    title: 'SimConnect.NET 0.1.7-beta',
    description: 'This release fixes a critical deployment issue where the native SimConnect.dll wasn\'t automatically included with the NuGet package, causing runtime errors for applications using SimConnect.NET. The package now includes the required DLL in the correct runtime folder, eliminating the need for manual workarounds. This change ensures seamless installation and deployment for Windows x64 applications without requiring additional setup steps from developers.',
    changelog: `### Added

-   Packaged native \`SimConnect.dll\` inside the NuGet under \`runtimes/win-x64/native\`, enabling automatic deployment of the unmanaged dependency.

### Changed

-   Updated project file to treat \`lib/SimConnect.dll\` as packed content (\`Content\` with \`<Pack>true</Pack>\` and RID-specific package path) instead of a build-only copy item.

### Notes

-   Fixes \`DllNotFoundException\` (\`Unable to load DLL 'SimConnect.dll'\`) encountered by consumers of previous versions unless they manually supplied the DLL.
-   If you previously worked around the issue by copying the DLL manually, you can remove that step after upgrading.
-   Architecture currently targets Windows x64 (MSFS is x64); additional RIDs can be added in future if needed.`
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
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-4xl font-semibold">Changelog</h1>
            
            {/* Search Bar */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search changelog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-zinc-400 text-sm"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-zinc-800 mb-12"></div>

          {/* Changelog Content */}
          <div className="relative">
            {/* Timeline (Left Side) - positioned to align with "C" */}
            <div className="absolute left-0 top-0">
              <div className="flex items-center mb-4">
                <div className="relative">
                  <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-900 shadow-lg transition-colors duration-300"></div>
                  <div 
                    className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-pulse opacity-50"
                    style={{ animationDuration: '3s' }}
                  ></div>
                  <div 
                    className="absolute -inset-0.5 w-4 h-4 bg-green-500 rounded-full animate-ping opacity-20"
                    style={{ animationDuration: '3s' }}
                  ></div>
                </div>
                <div className="text-sm text-zinc-300 font-medium ml-4 whitespace-nowrap">
                  {formatDate(mockChangelog.date)}
                </div>
              </div>
              <div className="w-px h-full bg-zinc-800 ml-1.5 min-h-[800px]"></div>
            </div>

            {/* Main Content (Right Side) */}
            <div className="ml-48">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-8">
                  {mockChangelog.title}
                </h2>
                
                {/* Placeholder Image */}
                <div className="mb-8">
                  <img 
                    src="https://placehold.co/500x250/2a2a2a/ffffff?text=SimConnect.NET+Release"
                    alt="Release preview"
                    className="rounded-lg"
                  />
                </div>

                {/* Description */}
                <div className="mb-10">
                  <p className="text-zinc-300 leading-relaxed text-base">
                    {mockChangelog.description}
                  </p>
                </div>

                {/* Changelog Details */}
                <div className="space-y-8">
                  <div 
                    className="prose prose-invert prose-zinc max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: mockChangelog.changelog
                        .replace(/### (.*)/g, '<h3 class="text-lg font-medium text-white mb-4 mt-8 first:mt-0">$1</h3>')
                        .replace(/^-   (.*)/gm, '<li class="text-zinc-300 mb-2 ml-4">$1</li>')
                        .replace(/(`[^`]+`)/g, '<code class="bg-zinc-800 text-zinc-200 px-2 py-1 rounded text-sm font-mono">$1</code>')
                        .replace(/(<li.*?>.*?<\/li>)/gs, '<ul class="list-disc space-y-2 mb-6 ml-4">$1</ul>')
                        .replace(/<\/ul>\s*<ul[^>]*>/g, '')
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Changelog;