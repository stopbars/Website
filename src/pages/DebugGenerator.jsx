import { useState, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import XMLMap from '../components/shared/XMLMap';

const DebugGenerator = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [generatedFiles, setGeneratedFiles] = useState(null);
  const [airportIcao, setAirportIcao] = useState('');
  const fileInputRef = useRef(null);
  const [generatedXml, setGeneratedXml] = useState(null);
  const formatXML = (xml) => {
    let formatted = '';
    const reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) pad -= 1;
      } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }
      let padding = '';
      for (let i = 0; i < pad; i++) padding += '  ';
      formatted += padding + node + '\r\n';
      pad += indent;
    });
    return formatted;
  };

  const downloadXML = (xml, filename) => {
    const formattedXML = formatXML(xml);
    const blob = new Blob([formattedXML], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setProgress('');
    setGeneratedFiles(null);
    setGeneratedXml(null);

    const file = fileInputRef.current?.files[0];
    if (!file) {
      setError('Please select an XML file');
      return;
    }

    // Use user-provided ICAO if available
    let icao = airportIcao.trim().toUpperCase();

    // If no ICAO provided, try to extract from filename
    if (!icao) {
      const match = file.name.match(/^([A-Z]{4})/);
      if (match && match[1]) {
        icao = match[1];
      } else {
        // Try to extract from the file content
        try {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const content = event.target.result;
            const icaoMatch = content.match(/<Airport[^>]*>([A-Z]{4})<\/Airport>/i);
            if (icaoMatch && icaoMatch[1]) {
              icao = icaoMatch[1];
              processFile(file, icao);
            } else {
              // Make a best guess based on first 4 characters of filename that are letters
              const bestGuess = file.name
                .replace(/[^A-Z]/gi, '')
                .substring(0, 4)
                .toUpperCase();
              icao = bestGuess || 'XXXX';
              processFile(file, icao);
            }
          };
          reader.readAsText(file);
          return; // Exit early as we're handling this asynchronously
        } catch (error) {
          icao = 'XXXX'; // Default if we can't determine
          console.error('Error reading file:', error);
        }
      }
    }

    processFile(file, icao);
  };
  const processFile = async (file, icao) => {
    setIsLoading(true);
    setProgress('Generating support files...');

    try {
      const formData = new FormData();
      formData.append('xmlFile', file);
      formData.append('icao', icao);

      const response = await fetch('https://v2.stopbars.com/supports/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate files');
      }

      const data = await response.json();
      setGeneratedFiles({
        supportsXml: data.supportsXml,
        barsXml: data.barsXml,
      });

      // Set the XML data for the XMLMap component
      setGeneratedXml(data.barsXml);

      setProgress('Files generated successfully!');
    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
      if (!error) {
        setTimeout(() => setProgress(''), 5000);
      }
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <h1 className="text-3xl font-bold mb-4">BARS Contribution Tester</h1>
          <p className="text-zinc-400 mb-8">
            Upload an MSFS XML file to test and visualize stopbar and lead-on light positions
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <Card className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Airport ICAO:
                    </label>
                    <input
                      type="text"
                      value={airportIcao}
                      onChange={(e) => setAirportIcao(e.target.value)}
                      placeholder="E.g., EGLL"
                      className="mt-1 block w-full rounded-md bg-zinc-800 border border-zinc-700 
                        focus:border-blue-500 focus:ring-blue-500 py-2 px-3 text-zinc-300 text-sm"
                    />
                    <p className="mt-1 text-sm text-zinc-500">
                      If not provided, we&apos;ll try to extract from the file name or content
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      MSFS XML File:
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".xml"
                      className="mt-1 block w-full text-sm text-zinc-300
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-md file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-600 file:text-white
                        hover:file:bg-blue-500 transition-colors"
                      disabled={isLoading}
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                      <p className="text-red-500 text-sm">{error}</p>
                    </div>
                  )}

                  {progress && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
                      <div className="flex items-center">
                        {isLoading && (
                          <div className="mr-2 h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                        <p className="text-blue-400 text-sm">{progress}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                        ${
                          isLoading
                            ? 'bg-zinc-600 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                        }`}
                    >
                      {isLoading ? 'Generating...' : 'Generate Support Files'}
                    </button>

                    {generatedFiles && (
                      <div className="flex flex-col space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadXML(generatedFiles.supportsXml, `light_supports.xml`)
                          }
                          className="w-full py-2 px-4 border border-blue-500/30 rounded-md shadow-sm text-sm font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                          Download Light Supports XML
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadXML(generatedFiles.barsXml, `bars_contribution.xml`)
                          }
                          className="w-full py-2 px-4 border border-green-500/30 rounded-md shadow-sm text-sm font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                        >
                          Download BARS Contribution XML
                        </button>
                      </div>
                    )}
                  </div>
                </form>{' '}
                {generatedXml && (
                  <div className="pt-6 mt-6 border-t border-zinc-800">
                    <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-md">
                      <p className="text-zinc-300 text-sm">XML generated successfully</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="p-0 overflow-hidden">
                <XMLMap xmlData={generatedXml} />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DebugGenerator;
