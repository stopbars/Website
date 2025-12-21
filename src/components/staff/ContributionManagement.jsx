import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import {
  AlertTriangle,
  Check,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Upload,
  Eye,
  FileUp,
  Loader,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import XMLMap from '../shared/XMLMap';
import { getVatsimToken } from '../../utils/cookieUtils';

const CONTRIBUTIONS_PER_PAGE = 5;

const UploadContribution = ({ onClose, onUpload }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [airportIcao, setAirportIcao] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!airportIcao.trim()) {
      setError('Please enter an airport ICAO code');
      return;
    }

    setLoading(true);
    try {
      // Read the file content
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(file);
      });

      onUpload({
        airportIcao: airportIcao.toUpperCase(),
        fileContent,
      });
    } catch (err) {
      setError(err.message || 'Failed to process file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-8 rounded-xl max-w-2xl w-full mx-4 border border-zinc-800">
        <h2 className="text-2xl font-bold mb-6">Upload Contribution</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Airport ICAO</label>
            <input
              type="text"
              value={airportIcao}
              onChange={(e) => setAirportIcao(e.target.value.toUpperCase())}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="e.g. EGLL"
              maxLength={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">XML File</label>
            <div className="flex items-center space-x-2">
              <input
                type="file"
                accept=".xml"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current.click()}
              >
                <FileUp className="w-4 h-4 mr-2" />
                {file ? file.name : 'Select XML File'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          <div className="flex space-x-4 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !file}>
              {loading ? (
                <div className="flex items-center justify-center">
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  <span>Uploading...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Upload</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

UploadContribution.propTypes = {
  onClose: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
};

// New Review Modal component with map and XML upload
const ReviewModal = ({ contribution, onClose, onApprove, onReject }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setMapCenter] = useState([0, 0]);
  const [mapZoom] = useState(15);
  const [parsedLights, setParsedLights] = useState([]);
  const [rejectionReason, setRejectionReason] = useState('');
  const mapRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState(null);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [updatedPackageName, setUpdatedPackageName] = useState(contribution.packageName);

  useEffect(() => {
    // Set initial map center based on airport coordinates
    const fetchAirportData = async () => {
      try {
        const response = await fetch(
          `https://v2.stopbars.com/airports?icao=${contribution.airportIcao}`
        );
        if (response.ok) {
          const airportData = await response.json();
          if (airportData && airportData.latitude && airportData.longitude) {
            setMapCenter([airportData.latitude, airportData.longitude]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch airport coordinates:', error);
      }
    };

    fetchAirportData();
  }, [contribution.airportIcao]);
  (xmlString) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

      let polygonFeatures = [];
      let removeAreas = [];

      // Check if the XML has FSData/Polygon elements (for MSFS XML files)
      const polygons = Array.from(xmlDoc.getElementsByTagName('Polygon'));

      if (polygons.length > 0) {
        polygons.forEach((polygon) => {
          const displayName = polygon.getAttribute('displayName') || 'Unknown';
          const groupIndex = polygon.getAttribute('groupIndex') || '';
          const vertices = Array.from(polygon.getElementsByTagName('Vertex'));

          if (vertices.length < 2) {
            return; // Skip polygons with less than 2 vertices
          }

          // Extract vertices as array of coordinate pairs
          const polygonCoordinates = vertices
            .map((vertex) => {
              const lat = parseFloat(vertex.getAttribute('lat'));
              const lon = parseFloat(vertex.getAttribute('lon'));

              if (!isNaN(lat) && !isNaN(lon)) {
                return [lat, lon];
              }
              return null;
            })
            .filter((coord) => coord !== null);

          // Skip empty polygons
          if (polygonCoordinates.length < 2) {
            return;
          }

          // Handle "remove" areas differently
          if (displayName.toLowerCase() === 'remove') {
            removeAreas.push({
              id: `remove-${polygon.getAttribute('UniqueGUID') || Date.now()}`,
              name: displayName,
              type: 'remove',
              coordinates: polygonCoordinates,
            });
          } else {
            // Determine type from naming convention or groupIndex
            let type = 'stopbar';
            if (groupIndex) {
              // Use groupIndex to determine light type
              switch (parseInt(groupIndex)) {
                case 1:
                case 2:
                  type = 'stopbar';
                  break;
                case 3:
                case 4:
                  type = 'lead_on';
                  break;
                case 5:
                case 6:
                case 7:
                case 8:
                  type = 'taxiway';
                  break;
                default:
                  type = 'stopbar';
              }
            }

            // Create polygon feature
            polygonFeatures.push({
              id: `${displayName}-${Date.now()}`,
              name: displayName,
              type,
              coordinates: polygonCoordinates,
            });
          }
        });
      } else {
        // Fallback to original Stopbar parsing logic
        const stopbars = Array.from(xmlDoc.getElementsByTagName('Stopbar'));

        stopbars.forEach((stopbar) => {
          const coordinates = stopbar.getElementsByTagName('Coordinates')[0]?.textContent;
          const name = stopbar.getAttribute('name') || 'Unknown';
          const type = stopbar.getAttribute('type') || 'stopbar';

          if (coordinates) {
            const points = coordinates.trim().split(' ');
            const polygonCoordinates = points
              .map((point) => {
                const [lat, lon] = point.split(',');
                if (lat && lon) {
                  return [parseFloat(lat), parseFloat(lon)];
                }
                return null;
              })
              .filter((coord) => coord !== null);

            if (polygonCoordinates.length >= 2) {
              polygonFeatures.push({
                id: `${name}-${Date.now()}`,
                name,
                type,
                coordinates: polygonCoordinates,
              });
            }
          }
        });
      }

      // Combine regular features and remove areas
      return [...polygonFeatures, ...removeAreas];
    } catch (error) {
      console.error('Error parsing XML:', error);
      setError("Failed to parse XML file. Please ensure it's a valid format.");
      return [];
    }
  };

  // Parse the advanced BARS XML format (from the generator)
  const parseGeneratedXML = (xmlString) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const objects = xmlDoc.getElementsByTagName('BarsObject');
      const allLights = [];
      let firstPosition = null;

      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const objId = obj.getAttribute('id');
        const objType = obj.getAttribute('type');
        const propsElement = obj.querySelector('Properties');
        const color = propsElement?.querySelector('Color')?.textContent || '';
        const orientation = propsElement?.querySelector('Orientation')?.textContent || '';
        const elevated = propsElement?.querySelector('Elevated')?.textContent === 'true';
        const lightElements = obj.getElementsByTagName('Light');

        for (let j = 0; j < lightElements.length; j++) {
          const light = lightElements[j];
          const position = light.querySelector('Position')?.textContent.split(',');
          const heading = parseFloat(light.querySelector('Heading')?.textContent || '0');
          const lightProps = light.querySelector('Properties');
          const lightColor = lightProps?.querySelector('Color')?.textContent || color;
          const lightOrientation =
            lightProps?.querySelector('Orientation')?.textContent || orientation;

          if (position && position.length === 2) {
            const lat = parseFloat(position[0]);
            const lng = parseFloat(position[1]);
            if (!firstPosition) {
              firstPosition = [lat, lng];
            }
            allLights.push({
              id: `${objId}_${j}`,
              position: [lat, lng],
              heading: heading,
              type: objType,
              color: lightColor,
              orientation: lightOrientation,
              elevated: elevated,
              objectId: objId,
            });
          }
        }
      }

      if (firstPosition) {
        setMapCenter(firstPosition);
      }

      return allLights;
    } catch (error) {
      console.error('Error parsing generated XML:', error);
      setError('Failed to parse the generated XML file.');
      return [];
    }
  };
  const generateLightsFromXML = async () => {
    setIsGenerating(true);
    setError('');

    try {
      // Create a FormData object and append the XML
      const formData = new FormData();
      const blob = new Blob([contribution.submittedXml], { type: 'application/xml' });
      formData.append('xmlFile', blob, `${contribution.airportIcao}_contribution.xml`);
      formData.append('icao', contribution.airportIcao);

      // Make the API request
      const response = await fetch('https://v2.stopbars.com/supports/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate light files');
      }

      const data = await response.json();
      setGeneratedFiles({
        supportsXml: data.supportsXml,
        barsXml: data.barsXml,
      });

      // Parse and display the generated lights
      const lights = parseGeneratedXML(data.barsXml);
      setParsedLights(lights);

      // If we have lights and a map, center the map on the first light
      if (lights.length > 0 && mapRef.current) {
        setMapCenter(lights[0].position);
        mapRef.current.setView(lights[0].position, mapZoom);
      }
    } catch (error) {
      console.error('Error generating lights:', error);
      setError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };
  const handleApprove = async () => {
    setLoading(true);
    try {
      const token = getVatsimToken();

      // Check if package name was modified
      const hasPackageNameChanged = updatedPackageName !== contribution.packageName;

      const response = await fetch(
        `https://v2.stopbars.com/contributions/${contribution.id}/decision`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Vatsim-Token': token,
          },
          body: JSON.stringify({
            approved: true,
            // Only include newPackageName if it was actually changed
            ...(hasPackageNameChanged && { newPackageName: updatedPackageName }),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to approve contribution');
      }

      onApprove();
      onClose();
    } catch (error) {
      setError(`Error approving contribution: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setLoading(true);
    try {
      const token = getVatsimToken();

      // Check if package name was modified
      const hasPackageNameChanged = updatedPackageName !== contribution.packageName;

      const response = await fetch(
        `https://v2.stopbars.com/contributions/${contribution.id}/decision`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Vatsim-Token': token,
          },
          body: JSON.stringify({
            approved: false,
            rejectionReason: rejectionReason,
            // Only include newPackageName if it was actually changed
            ...(hasPackageNameChanged && { newPackageName: updatedPackageName }),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to reject contribution');
      }

      onReject();
      onClose();
    } catch (error) {
      setError(`Error rejecting contribution: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto py-4">
      <div className="bg-zinc-900 p-5 rounded-xl max-w-3xl w-full mx-4 border border-zinc-800 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Review Contribution</h2>
          <div className="flex items-center space-x-3">
            <span className="text-sm bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full">
              {contribution.airportIcao}
            </span>
            <span className="text-sm bg-zinc-800 px-3 py-1 rounded-full">
              {new Date(contribution.submissionDate).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center mb-6">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full 
            ${step >= 1 ? 'bg-blue-500' : 'bg-zinc-700'}`}
          >
            <span>1</span>
          </div>
          <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full 
            ${step >= 2 ? 'bg-blue-500' : 'bg-zinc-700'}`}
          >
            <span>2</span>
          </div>
        </div>

        {/* Step content */}
        <div className="mb-6">
          {step === 1 && (
            <div className="space-y-6">
              {' '}
              <div className="bg-zinc-800/50 p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-4">Contribution Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-zinc-400">Airport ICAO</p>
                    <p className="font-semibold">{contribution.airportIcao}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-zinc-400">Package Name</p>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-xs text-blue-400 hover:text-blue-300"
                        onClick={() => setIsEditingPackage(!isEditingPackage)}
                      >
                        {isEditingPackage ? 'Cancel' : 'Edit'}
                      </Button>
                    </div>
                    {isEditingPackage ? (
                      <input
                        type="text"
                        value={updatedPackageName}
                        onChange={(e) => setUpdatedPackageName(e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    ) : (
                      <p className="font-semibold">
                        {updatedPackageName || contribution.packageName}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Simulator</p>
                    <p className="font-semibold">
                      {contribution.simulator === 'msfs2024'
                        ? 'MSFS 2024'
                        : contribution.simulator === 'msfs2020'
                          ? 'MSFS 2020'
                          : contribution.simulator || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Submitted By</p>
                    <p className="font-semibold">
                      {contribution.userDisplayName || contribution.userId}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Date</p>
                    <p className="font-semibold">
                      {new Date(contribution.submissionDate).toLocaleString()}
                    </p>
                  </div>
                </div>

                {contribution.notes && (
                  <div className="mt-4">
                    <p className="text-sm text-zinc-400">Notes</p>
                    <p className="bg-zinc-900 p-3 rounded mt-1 text-sm">{contribution.notes}</p>
                  </div>
                )}
              </div>
              <div className="bg-zinc-800/50 p-4 rounded-lg">
                {' '}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">XML Visualization</h3>
                  <div>
                    <Button
                      onClick={generateLightsFromXML}
                      variant="default"
                      size="sm"
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Generate Points
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="h-[400px] w-full bg-zinc-900 rounded-lg overflow-hidden">
                  {generatedFiles && generatedFiles.barsXml ? (
                    <XMLMap xmlData={generatedFiles.barsXml} height="400px" />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-zinc-800/30">
                      <p className="text-zinc-400">
                        {isGenerating
                          ? 'Generating map data...'
                          : 'Click "Generate Points" to visualize the XML data'}
                      </p>
                    </div>
                  )}
                </div>
                {parsedLights.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex justify-between items-center">
                    <p className="text-blue-400 text-sm">
                      {parsedLights.length} lights visualized
                      {generatedFiles && ' (generated)'}
                    </p>

                    {generatedFiles && (
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => {
                            // Format the XML before downloading
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

                            const formattedXML = formatXML(generatedFiles.barsXml);
                            const blob = new Blob([formattedXML], { type: 'application/xml' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${contribution.airportIcao}_bars_contribution.xml`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          <FileUp className="w-4 h-4 mr-2" />
                          Download Generated XML
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {error && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-500 text-sm">{error}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-3 border border-emerald-500/20 p-4 rounded-lg bg-emerald-500/10">
                  <h4 className="font-medium flex items-center text-emerald-400">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Approve Contribution
                  </h4>
                  <p className="text-sm text-zinc-300">
                    Approving this contribution will make these lights available in the BARS system.
                  </p>
                  <Button
                    onClick={handleApprove}
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-500 w-full"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        <span>Approve</span>
                      </div>
                    )}
                  </Button>
                </div>

                <div className="space-y-3 border border-red-500/20 p-4 rounded-lg bg-red-500/10">
                  <h4 className="font-medium flex items-center text-red-400">
                    <XCircle className="w-5 h-5 mr-2" />
                    Reject Contribution
                  </h4>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-zinc-300">
                      Reason for Rejection
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500"
                      placeholder="Explain why this contribution is being rejected..."
                      rows={3}
                      required
                    />
                  </div>
                  <Button
                    onClick={handleReject}
                    disabled={loading || !rejectionReason.trim()}
                    className="bg-red-600 hover:bg-red-500 w-full"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <XCircle className="w-4 h-4 mr-2" />
                        <span>Reject</span>
                      </div>
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-between">
          {step === 1 ? (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          {step === 1 && (
            <Button onClick={() => setStep(2)}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

ReviewModal.propTypes = {
  contribution: PropTypes.shape({
    id: PropTypes.string.isRequired,
    airportIcao: PropTypes.string.isRequired,
    packageName: PropTypes.string.isRequired,
    userId: PropTypes.string.isRequired,
    userDisplayName: PropTypes.string,
    simulator: PropTypes.string,
    submittedXml: PropTypes.string.isRequired,
    notes: PropTypes.string,
    submissionDate: PropTypes.string.isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

// Main Component
const ContributionManagement = () => {
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedContribution, setSelectedContribution] = useState(null);
  const [,] = useState('pending');
  // Track only pending count (stats endpoint removed)
  const [pendingCount, setPendingCount] = useState(0);
  // eslint-disable-next-line no-empty-pattern
  const [] = useState(false);
  const [, setActivePoints] = useState([]);
  const [, setComparisonResults] = useState(null);
  const fetchContributions = useCallback(async () => {
    setLoading(true);
    try {
      const token = getVatsimToken();
      const response = await fetch(
        `https://v2.stopbars.com/contributions?page=${currentPage}&limit=${CONTRIBUTIONS_PER_PAGE}&status=pending`,
        {
          headers: {
            'X-Vatsim-Token': token,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch contributions');
      }

      const data = await response.json();
      setContributions(data.contributions);
      setTotalPages(Math.ceil(data.totalCount / CONTRIBUTIONS_PER_PAGE));
      setPendingCount(data.totalCount || 0);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchContributions();
  }, [fetchContributions]);

  const handleReview = (contribution) => {
    setSelectedContribution(contribution);
  };

  const handleApproval = async () => {
    await fetchContributions();
  };

  const handleRejection = async () => {
    await fetchContributions();
  };

  const handleContributionSelect = (contribution) => {
    setSelectedContribution(contribution);
    setActivePoints([]);
    setComparisonResults(null);
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400">
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-500/20 text-red-400">
            Rejected
          </span>
        );
      case 'outdated':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-500/20 text-gray-400">
            Outdated
          </span>
        );
      default:
        return null;
    }
  };

  // Filter contributions based on search term if needed
  const paginatedContributions = contributions;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Contribution Management</h2>
          <p className="text-zinc-400 text-sm mt-1">Review and manage user contributions</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-sm font-medium">
            {pendingCount || '0'} Pending Contribution{pendingCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {/* Status messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
          <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-emerald-400">{success}</p>
        </div>
      )}{' '}
      <div className="grid grid-cols-1 gap-6">
        {/* Contributions list */}
        <div className="space-y-4">
          {loading && !selectedContribution ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : paginatedContributions.length === 0 ? (
            <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
              <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
              <p className="text-zinc-400">No pending contributions found.</p>
            </Card>
          ) : (
            <>
              {paginatedContributions.map((contribution) => (
                <Card
                  key={contribution.id}
                  className={`bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all duration-200 cursor-pointer ${
                    selectedContribution?.id === contribution.id ? 'border-blue-500' : ''
                  }`}
                  onClick={() => handleContributionSelect(contribution)}
                >
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">{contribution.airportIcao}</h3>
                        {renderStatusBadge(contribution.status)}
                      </div>

                      <p className="text-sm text-zinc-400 mb-2">
                        Package: <span className="text-zinc-300">{contribution.packageName}</span>
                        {contribution.simulator && (
                          <span
                            className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${
                              contribution.simulator === 'msfs2024'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            {contribution.simulator === 'msfs2024'
                              ? 'MSFS 2024'
                              : contribution.simulator === 'msfs2020'
                                ? 'MSFS 2020'
                                : contribution.simulator}
                          </span>
                        )}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                        <p className="text-zinc-400">
                          Submitted by:{' '}
                          <span className="text-zinc-300">
                            {contribution.userDisplayName || contribution.userId}
                          </span>
                        </p>

                        <p className="text-zinc-400">
                          Date:{' '}
                          <span className="text-zinc-300">
                            {new Date(contribution.submissionDate).toLocaleDateString()}
                          </span>
                        </p>

                        {contribution.status !== 'pending' && contribution.decisionDate && (
                          <p className="text-zinc-400">
                            Decision:{' '}
                            <span className="text-zinc-300">
                              {new Date(contribution.decisionDate).toLocaleDateString()}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReview(contribution);
                        }}
                        disabled={loading}
                        variant={contribution.status === 'pending' ? 'default' : 'outline'}
                        size="sm"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {contribution.status === 'pending' ? 'Review' : 'View'}
                      </Button>
                    </div>
                  </div>
                  {contribution.status === 'rejected' && contribution.rejectionReason && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <p className="text-xs text-red-400 mb-1">Rejection reason:</p>
                      <p className="text-sm text-zinc-300">{contribution.rejectionReason}</p>
                    </div>
                  )}
                </Card>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                  <span className="text-sm text-zinc-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* Review modal */}
      {selectedContribution && (
        <ReviewModal
          contribution={selectedContribution}
          onClose={() => setSelectedContribution(null)}
          onApprove={handleApproval}
          onReject={handleRejection}
        />
      )}
    </div>
  );
};

export default ContributionManagement;
