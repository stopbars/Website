/* oxlint-disable react-doctor/no-set-state-after-await-in-effect -- The one-shot review generation is guarded by isGeneratingRef and belongs to the mounted review modal. */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Upload,
  Eye,
  FileUp,
  Loader,
  CheckCircle,
  XCircle,
  FileText,
  SquarePen,
  Copy,
  Search,
  X,
} from 'lucide-react';
import XMLMap from '../shared/XMLMap';
import { Toast } from '../shared/Toast';
import { SimulatorBadge } from '../shared/SimulatorBadge';
import { PageLoading } from '../shared/PageLoading';
import ReviewModal from './ContributionReviewWorkspace';
import { getVatsimToken } from '../../utils/cookieUtils';
import {
  CONTRIBUTION_STATUS_FILTERS,
  countContributionStatuses,
  filterContributionHistory,
} from '../../utils/contributionHistory.js';

const CONTRIBUTIONS_PER_PAGE = 8;

const STATUS_LABELS = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  outdated: 'Outdated',
};

const STATUS_BADGE_STYLES = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  outdated: 'bg-gray-500/20 text-gray-400',
};

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
            <label htmlFor="contribution-airport-icao" className="block text-sm font-medium mb-2">
              Airport ICAO
            </label>
            <input
              id="contribution-airport-icao"
              type="text"
              value={airportIcao}
              onChange={(e) => setAirportIcao(e.target.value.toUpperCase())}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="e.g. EGLL"
              maxLength={4}
            />
          </div>

          <div>
            <label htmlFor="contribution-xml-file" className="block text-sm font-medium mb-2">
              XML File
            </label>
            <div className="flex items-center space-x-2">
              <input
                id="contribution-xml-file"
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

// oxlint-disable-next-line react-doctor/no-giant-component, react-doctor/no-high-complexity-react-function, react-doctor/prefer-useReducer -- The review form is one cohesive modal; its validation and upload states are intentionally independent.
export const LegacyContributionReviewModal = ({
  contribution,
  onClose,
  onApprove,
  onReject,
  onError,
}) => {
  const [step, setStep] = useState(1);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [mapZoom] = useState(15);
  const [parsedLights, setParsedLights] = useState([]);
  const [rejectionReason, setRejectionReason] = useState('');
  const mapRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const [generatedFiles, setGeneratedFiles] = useState(null);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [updatedPackageName, setUpdatedPackageName] = useState(contribution.packageName);
  const [notesCopied, setNotesCopied] = useState(false);

  // Auto-generate points when entering step 2
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect -- File metadata is a one-shot companion request scoped to this review modal.
  useEffect(() => {
    if (step === 2 && !generatedFiles && !isGeneratingRef.current) {
      generateLightsFromXML();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, generatedFiles]);

  // Parse the advanced BARS XML format (from the generator)
  const parseGeneratedXML = (xmlString) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const objects = xmlDoc.getElementsByTagName('BarsObject');
      const allLights = [];

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

      return allLights;
    } catch (error) {
      console.error('Error parsing generated XML:', error);
      onError({
        title: 'Parse Error',
        description: 'Failed to parse the generated XML file.',
      });
      return [];
    }
  };
  const generateLightsFromXML = async () => {
    isGeneratingRef.current = true;

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
        mapRef.current.setView(lights[0].position, mapZoom);
      }
    } catch (error) {
      console.error('Error generating lights:', error);
      onError({
        title: 'Generation Failed',
        description: error.message,
      });
    } finally {
      isGeneratingRef.current = false;
    }
  };
  const handleApprove = async () => {
    setIsApproving(true);
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
      onError({
        title: 'Approval Failed',
        description: error.message,
      });
    } finally {
      setIsApproving(false);
    }
  };
  const handleReject = async () => {
    setIsRejecting(true);
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
      onError({
        title: 'Rejection Failed',
        description: error.message,
      });
    } finally {
      setIsRejecting(false);
    }
  };
  return (
    <>
      <Dialog
        open={true}
        onClose={onClose}
        icon={Eye}
        iconColor="blue"
        title="Review Contribution"
        maxWidth="2xl"
        isLoading={isApproving || isRejecting}
        closeOnBackdrop={!isApproving && !isRejecting}
        closeOnEscape={!isApproving && !isRejecting}
      >
        {/* Stepper */}
        <div className="flex items-center mb-6">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors duration-[var(--duration-fast)]
          ${step >= 1 ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}
          >
            1
          </div>
          <div className="flex-1 h-0.5 mx-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full bg-blue-500 transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)] ${step >= 2 ? 'w-full' : 'w-0'}`}
            />
          </div>
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors duration-[var(--duration-fast)]
          ${step >= 2 ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}
          >
            2
          </div>
          <div className="flex-1 h-0.5 mx-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full bg-blue-500 transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)] ${step >= 3 ? 'w-full' : 'w-0'}`}
            />
          </div>
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors duration-[var(--duration-fast)]
          ${step >= 3 ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}
          >
            3
          </div>
        </div>

        {/* Step content */}
        <div className="mb-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-zinc-800/50 p-5 rounded-lg">
                <h3 className="text-lg font-medium mb-5">Contribution Details</h3>

                {/* Row 1: Airport ICAO | Simulator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-zinc-400 mb-1">Airport ICAO</p>
                    <p className="font-semibold text-white">{contribution.airportIcao}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400 mb-1">Simulator</p>
                    <SimulatorBadge simulator={contribution.simulator} size="sm" />
                  </div>
                </div>

                {/* Row 2: Package | Submitted By */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-zinc-400">Package</p>
                      <button
                        type="button"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={() => setIsEditingPackage(!isEditingPackage)}
                        title={isEditingPackage ? 'Finish editing' : 'Edit package name'}
                      >
                        {isEditingPackage ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : (
                          <SquarePen className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {isEditingPackage ? (
                      <input
                        aria-label="Updated package name"
                        type="text"
                        value={updatedPackageName}
                        onChange={(e) => setUpdatedPackageName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                      />
                    ) : (
                      <p className="font-semibold text-white">
                        {updatedPackageName || contribution.packageName}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400 mb-1">Submitted By</p>
                    <p className="font-semibold text-white">
                      {contribution.userDisplayName || contribution.userId}
                    </p>
                  </div>
                </div>

                {/* Row 3: Date */}
                <div className="mb-5">
                  <p className="text-sm text-zinc-400 mb-1">Date</p>
                  <p className="font-semibold text-white">
                    {new Date(contribution.submissionDate).toLocaleString()}
                  </p>
                </div>

                {/* Row 4: Notes */}
                <div>
                  <p className="text-sm text-zinc-400 mb-1">Notes</p>
                  {contribution.notes ? (
                    <div className="relative">
                      <p className="bg-zinc-900/50 p-3 pr-10 rounded-lg text-sm text-zinc-300 border border-zinc-700/50">
                        {contribution.notes}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(contribution.notes);
                          setNotesCopied(true);
                          setTimeout(() => setNotesCopied(false), 2000);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-zinc-700/50 transition-colors"
                        title="Copy notes"
                      >
                        {notesCopied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-zinc-400 hover:text-zinc-300" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 italic">No notes provided</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-zinc-800/50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium">XML Visualization</h3>
                    {parsedLights.length > 0 && (
                      <span className="text-sm text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                        {parsedLights.length} lights
                      </span>
                    )}
                  </div>
                  {generatedFiles && (
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
                        a.download = `${contribution.airportIcao}_BARS_Contribution.xml`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <FileUp className="w-4 h-4 mr-2" />
                      Download XML
                    </Button>
                  )}
                </div>
                <div className="h-[400px] w-full bg-zinc-900 rounded-lg overflow-hidden">
                  {generatedFiles && generatedFiles.barsXml ? (
                    <XMLMap xmlData={generatedFiles.barsXml} height="400px" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full bg-zinc-800/30">
                      <Loader className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                      <p className="text-zinc-400">Generating map data...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-3 border border-emerald-500/20 p-4 rounded-lg bg-emerald-500/10">
                  <h4 className="font-medium flex items-center text-emerald-400">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Approve Contribution
                  </h4>
                  <p className="text-sm text-zinc-300 mb-1">
                    Approving this contribution will make this airport contribution available in
                    BARS.
                  </p>
                  <Button
                    onClick={handleApprove}
                    disabled={isApproving || isRejecting}
                    className="bg-emerald-600 hover:bg-emerald-500 w-full"
                  >
                    {isApproving ? (
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
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleReject();
                    }}
                  >
                    <textarea
                      aria-label="Rejection reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500 resize-none mb-3"
                      placeholder="Explain why this contribution is being rejected..."
                      rows={3}
                      required
                    />
                    <Button
                      type="submit"
                      disabled={isApproving || isRejecting}
                      className="bg-emerald-600 hover:bg-emerald-500 w-full"
                    >
                      {isRejecting ? (
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
                  </form>
                </div>
              </div>
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

          {step < 3 && (
            <Button onClick={() => setStep(step + 1)}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </Dialog>
    </>
  );
};

LegacyContributionReviewModal.propTypes = {
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
  onError: PropTypes.func.isRequired,
};

const StatusBadge = ({ status }) => {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_BADGE_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
};

StatusBadge.propTypes = {
  status: PropTypes.oneOf(['pending', 'approved', 'rejected', 'outdated']).isRequired,
};

const ContributionHistoryFilters = ({
  searchTerm,
  statusFilter,
  statusCounts,
  resultCount,
  totalCount,
  onSearchChange,
  onStatusChange,
  onClear,
}) => {
  const hasActiveFilters = searchTerm.trim() || statusFilter !== 'all';

  return (
    <section
      aria-label="Contribution history filters"
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <label htmlFor="contribution-history-search" className="text-sm font-medium text-zinc-200">
        Find a contribution
      </label>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            id="contribution-history-search"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search ID, airport, package, username, or VATSIM CID"
            className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-10 pr-10 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex min-h-8 min-w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onClear}
          disabled={!hasActiveFilters}
          aria-hidden={!hasActiveFilters}
          className={`min-h-11 px-4 ${hasActiveFilters ? '' : 'invisible'}`}
        >
          Clear filters
        </Button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter by status">
        {CONTRIBUTION_STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statusFilter === status}
            onClick={() => onStatusChange(status)}
            className={`inline-flex min-h-10 w-28 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
              statusFilter === status
                ? 'border border-blue-500/40 bg-blue-500/15 text-blue-200'
                : 'border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {STATUS_LABELS[status]}
            <span
              className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums ${
                statusFilter === status
                  ? 'bg-blue-500/20 text-blue-100'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {statusCounts[status]}
            </span>
          </button>
        ))}
      </div>
      <p role="status" className="mt-3 text-xs text-zinc-500">
        {resultCount === totalCount && !hasActiveFilters
          ? `${totalCount} contribution${totalCount === 1 ? '' : 's'} available`
          : `${resultCount} of ${totalCount} contributions shown`}
      </p>
    </section>
  );
};

ContributionHistoryFilters.propTypes = {
  searchTerm: PropTypes.string.isRequired,
  statusFilter: PropTypes.oneOf(CONTRIBUTION_STATUS_FILTERS).isRequired,
  statusCounts: PropTypes.objectOf(PropTypes.number).isRequired,
  resultCount: PropTypes.number.isRequired,
  totalCount: PropTypes.number.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onStatusChange: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};

const ContributionHistoryCard = ({ contribution, isSelected, isLoading, onOpen }) => (
  <Card
    className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-[background-color,border-color,color,box-shadow,filter,opacity,transform] duration-[var(--duration-quick)] ${
      isSelected ? 'border-blue-500' : ''
    }`}
  >
    <div className="flex flex-col justify-between gap-4 sm:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-lg font-semibold">{contribution.airportIcao}</h3>
          <StatusBadge status={contribution.status} />
        </div>
        <p className="mb-3 break-words text-base text-zinc-400">
          Package: <span className="text-zinc-300">{contribution.packageName}</span>
          {contribution.simulator && (
            <SimulatorBadge simulator={contribution.simulator} className="ml-2" />
          )}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <p className="text-zinc-400">
            Submitted by:{' '}
            <span className="text-zinc-300">
              {contribution.userDisplayName || contribution.userId}
            </span>
          </p>
          {contribution.userDisplayName && (
            <p className="text-zinc-400">
              VATSIM CID: <span className="font-mono text-zinc-300">{contribution.userId}</span>
            </p>
          )}
          <p className="text-zinc-400">
            Submitted:{' '}
            <span className="text-zinc-300">
              {new Date(contribution.submissionDate).toLocaleDateString()}
            </span>
          </p>
          {contribution.status !== 'pending' && contribution.decisionDate && (
            <p className="text-zinc-400">
              Decided:{' '}
              <span className="text-zinc-300">
                {new Date(contribution.decisionDate).toLocaleDateString()}
              </span>
            </p>
          )}
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-zinc-500">
          <span className="shrink-0">Contribution ID</span>
          <code className="min-w-0 truncate rounded bg-black/30 px-1.5 py-1 text-zinc-400">
            {contribution.id}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(contribution.id)}
            aria-label={`Copy contribution ID ${contribution.id}`}
            className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex items-center">
        <Button
          onClick={onOpen}
          disabled={isLoading}
          variant={contribution.status === 'pending' ? 'primary' : 'outline'}
        >
          {isLoading ? (
            <Loader className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {isLoading ? 'Loading' : contribution.status === 'pending' ? 'Review' : 'View'}
        </Button>
      </div>
    </div>
    {contribution.status === 'rejected' && (
      <div className="mt-3 border-t border-zinc-800 pt-3">
        <p className="mb-1 text-xs text-red-400">Rejection reason:</p>
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">
          {contribution.rejectionReason || 'No rejection reason was recorded.'}
        </p>
      </div>
    )}
  </Card>
);

ContributionHistoryCard.propTypes = {
  contribution: PropTypes.shape({
    id: PropTypes.string.isRequired,
    airportIcao: PropTypes.string.isRequired,
    packageName: PropTypes.string.isRequired,
    userId: PropTypes.string.isRequired,
    userDisplayName: PropTypes.string,
    simulator: PropTypes.string,
    submissionDate: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['pending', 'approved', 'rejected', 'outdated']).isRequired,
    rejectionReason: PropTypes.string,
    decisionDate: PropTypes.string,
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  onOpen: PropTypes.func.isRequired,
};

// Main Component
// oxlint-disable-next-line react-doctor/prefer-useReducer -- List filters, selection, and request status are independent state slices.
const ContributionManagement = () => {
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedContribution, setSelectedContribution] = useState(null);
  const [reviewLoadingId, setReviewLoadingId] = useState(null);
  const [toast, setToast] = useState({
    show: false,
    title: '',
    description: '',
    variant: 'default',
  });
  const fetchContributions = useCallback(async () => {
    setLoading(true);
    try {
      const token = getVatsimToken();
      const response = await fetch(
        'https://v2.stopbars.com/contributions?status=all&projection=metadata',
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
      setLoading(false);
    } catch (err) {
      setToast({
        show: true,
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContributions();
  }, [fetchContributions]);

  const handleReview = async (contribution) => {
    if (reviewLoadingId) return;
    setReviewLoadingId(contribution.id);
    try {
      const response = await fetch(`https://v2.stopbars.com/contributions/${contribution.id}`, {
        headers: { 'X-Vatsim-Token': getVatsimToken() },
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Failed to load contribution source');
      }
      const detail = await response.json();
      if (typeof detail.submittedXml !== 'string' || !detail.submittedXml) {
        throw new Error('Core did not return the submitted source for this contribution');
      }
      setSelectedContribution(detail);
    } catch (error) {
      setToast({
        show: true,
        title: 'Unable to open contribution',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setReviewLoadingId(null);
    }
  };

  const handleApproval = async () => {
    setToast({
      show: true,
      title: `${selectedContribution.airportIcao} Approved`,
      description: 'The contribution has been approved successfully.',
      variant: 'success',
    });
    await fetchContributions();
  };

  const handleRejection = async () => {
    setToast({
      show: true,
      title: `${selectedContribution.airportIcao} Rejected`,
      description: 'The contribution has been rejected.',
      variant: 'success',
    });
    await fetchContributions();
  };

  const handleError = (error) => {
    setSelectedContribution(null);
    setToast({
      show: true,
      title: error.title,
      description: error.description,
      variant: 'destructive',
    });
  };

  const statusCounts = useMemo(() => countContributionStatuses(contributions), [contributions]);
  const filteredContributions = useMemo(
    () => filterContributionHistory(contributions, searchTerm, statusFilter),
    [contributions, searchTerm, statusFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredContributions.length / CONTRIBUTIONS_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * CONTRIBUTIONS_PER_PAGE;
  const paginatedContributions = filteredContributions.slice(
    pageStart,
    pageStart + CONTRIBUTIONS_PER_PAGE
  );

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm.trim() || statusFilter !== 'all';

  return (
    <div className="staff-tool space-y-6">
      <div className="staff-tool-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Contribution Management</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Review new submissions and look up previous decisions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
            <FileText className="w-4 h-4 mr-2 text-zinc-400" />
            {statusCounts.pending} awaiting review
          </span>
        </div>
      </div>

      {/* Toast notifications */}
      <Toast
        show={toast.show}
        title={toast.title}
        description={toast.description}
        variant={toast.variant}
        onClose={() => setToast({ ...toast, show: false })}
      />

      <ContributionHistoryFilters
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        resultCount={filteredContributions.length}
        totalCount={contributions.length}
        onSearchChange={handleSearchChange}
        onStatusChange={handleStatusChange}
        onClear={clearFilters}
      />

      <div className="grid grid-cols-1 gap-6">
        {/* Contributions list */}
        <div className="min-h-[36rem] space-y-4">
          {loading && !selectedContribution ? (
            <PageLoading label="Loading contributions…" variant="tool-stack" />
          ) : paginatedContributions.length === 0 ? (
            <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
              <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
              <p className="font-medium text-zinc-300">No contributions match these filters.</p>
              <p className="mt-1 text-sm text-zinc-500">
                Try another ID, airport, contributor, or status.
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} className="mt-4">
                  Show all contributions
                </Button>
              )}
            </Card>
          ) : (
            <>
              {paginatedContributions.map((contribution) => (
                <ContributionHistoryCard
                  key={contribution.id}
                  contribution={contribution}
                  isSelected={selectedContribution?.id === contribution.id}
                  isLoading={loading || reviewLoadingId === contribution.id}
                  onOpen={() => handleReview(contribution)}
                />
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={visiblePage === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                  <span className="text-sm text-zinc-400">
                    Page {visiblePage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={visiblePage === totalPages}
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
          onError={handleError}
        />
      )}
    </div>
  );
};

export default ContributionManagement;
