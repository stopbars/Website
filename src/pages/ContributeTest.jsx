import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { ContributionFlowHeader } from '../components/contributions/ContributionFlowHeader';
import { Toast } from '../components/shared/Toast';
import XMLMap from '../components/shared/XMLMap';
import {
  ArrowRight,
  FileUp,
  Check,
  Loader,
  FileSearch,
  Spline,
  X,
  ExternalLink,
} from 'lucide-react';
import { getContributionDisabledMessage } from '../utils/contributionPolicy';
import {
  getCachedContributionAirport,
  getCachedContributionPolicy,
  loadContributionAirport,
  loadContributionPolicy as loadContributionPolicyData,
} from '../utils/contributionFlowData.js';
import { draftHash } from '../features/contribution-editor/editor-model.js';
import { preloadRoute } from '../utils/routeModules.js';
import { isFsDataXml } from '../utils/contributionContracts.js';

const StableXMLMap = memo(XMLMap);

/* oxlint-disable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function react-doctor/prefer-useReducer react-doctor/rerender-state-only-in-handlers react-doctor/prefer-tag-over-role react-doctor/no-set-state-after-await-in-effect -- Async lookups own cancellation guards; the cohesive test/upload workflow and composite drop zone preserve established behavior. */
const ContributeTest = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const incomingDraftXml =
    typeof location.state?.draftXml === 'string' ? location.state.draftXml : '';
  const incomingDraftFileName =
    typeof location.state?.draftFileName === 'string'
      ? location.state.draftFileName
      : `${icao}-Draft.xml`;
  const incomingSimulator = location.state?.simulator === 'xplane' ? 'xplane' : undefined;
  const incomingDraftHash =
    typeof location.state?.draftHash === 'string' ? location.state.draftHash : '';
  const incomingAirportName =
    typeof location.state?.airportName === 'string' ? location.state.airportName : '';
  const cachedAirport = getCachedContributionAirport(icao);
  const cachedPolicy = getCachedContributionPolicy(icao);
  const shouldAutoPrepare = location.state?.fromEditor === true && Boolean(incomingDraftXml);
  const autoPrepareAttemptedRef = useRef(false);
  const [simulator, setSimulator] = useState(
    () => incomingSimulator ?? detectDraftSimulator(incomingDraftXml)
  );

  const [selectedFile, setSelectedFile] = useState(() =>
    incomingDraftXml
      ? new File([incomingDraftXml], incomingDraftFileName, { type: 'application/xml' })
      : null
  );
  const [originalFileName, setOriginalFileName] = useState(() =>
    incomingDraftXml ? incomingDraftFileName : ''
  );
  const [originalFileSize, setOriginalFileSize] = useState(() =>
    incomingDraftXml ? new Blob([incomingDraftXml]).size : 0
  );
  const [xmlData, setXmlData] = useState(incomingDraftXml);
  const [originalXmlData, setOriginalXmlData] = useState(incomingDraftXml);
  const [supportsXmlData, setSupportsXmlData] = useState('');
  const [contributionToken, setContributionToken] = useState('');
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('Error');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isXmlTested, setIsXmlTested] = useState(false);
  const [generationHash, setGenerationHash] = useState('');
  const [expectedDraftHash, setExpectedDraftHash] = useState(incomingDraftHash);
  const [showPolyLines, setShowPolyLines] = useState(false);
  const [showRemoveAreas, setShowRemoveAreas] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [contributionPolicy, setContributionPolicy] = useState(cachedPolicy);
  const [policyChecked, setPolicyChecked] = useState(Boolean(cachedPolicy));
  const [airportName, setAirportName] = useState(incomingAirportName || cachedAirport?.name || '');
  const contributionsDisabled =
    contributionPolicy?.managed && !contributionPolicy?.contributionsEnabled;
  const disabledContributionMessage = getContributionDisabledMessage(contributionPolicy);

  useEffect(() => {
    if (cachedPolicy) return undefined;
    let cancelled = false;
    const loadContributionPolicy = async () => {
      try {
        const policy = await loadContributionPolicyData(icao);
        if (!cancelled) setContributionPolicy(policy);
      } catch (err) {
        console.error('Failed to load contribution policy:', err);
      } finally {
        if (!cancelled) setPolicyChecked(true);
      }
    };

    loadContributionPolicy();

    return () => {
      cancelled = true;
    };
  }, [cachedPolicy, icao]);

  useEffect(() => {
    if (incomingAirportName || cachedAirport) return undefined;

    let cancelled = false;
    const loadAirportName = async () => {
      try {
        const airport = await loadContributionAirport(icao);
        if (!cancelled && typeof airport?.name === 'string') {
          setAirportName(airport.name);
        }
      } catch (err) {
        console.error('Failed to load airport name:', err);
      }
    };

    loadAirportName();

    return () => {
      cancelled = true;
    };
  }, [cachedAirport, icao, incomingAirportName]);

  const processFile = (file) => {
    if (!file) {
      setSelectedFile(null);
      setXmlData('');
      setIsXmlTested(false);
      setGenerationHash('');
      setExpectedDraftHash('');
      setContributionToken('');
      setSupportsXmlData('');
      setSimulator(incomingSimulator ?? 'msfs2024');
      setShowRemoveAreas(false);
      return;
    }

    // Check file extension
    const validExtensions = ['.xml'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      setErrorTitle('Unable to open XML');
      setError('Choose a BARS contribution XML file.');
      setShowErrorToast(true);
      setSelectedFile(null);
      setXmlData('');
      setIsXmlTested(false);
      setGenerationHash('');
      setExpectedDraftHash('');
      setContributionToken('');
      setSupportsXmlData('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorTitle('Unable to open XML');
      setError('Choose an XML file smaller than 5 MB.');
      setShowErrorToast(true);
      setSelectedFile(null);
      setXmlData('');
      setIsXmlTested(false);
      setGenerationHash('');
      setExpectedDraftHash('');
      setContributionToken('');
      setSupportsXmlData('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError('');
    setShowErrorToast(false);
    setSelectedFile(file);
    setIsXmlTested(false);
    setGenerationHash('');
    setExpectedDraftHash('');
    setContributionToken('');
    setSupportsXmlData('');

    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target.result ?? '');
      if (!isFsDataXml(content)) {
        setErrorTitle('Unable to open XML');
        setError(
          /<BarsLights\b/i.test(content)
            ? 'This is a published runtime map. Download the source XML from the contribution dashboard.'
            : 'This file does not contain editable BARS FSData XML.'
        );
        setShowErrorToast(true);
        setSelectedFile(null);
        setXmlData('');
        setOriginalXmlData('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setXmlData(content);
      setOriginalXmlData(content);
      setSimulator(incomingSimulator ?? detectDraftSimulator(content));
      // Reset visualization toggles when new file is loaded
      setShowPolyLines(false);
      setShowRemoveAreas(false);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    processFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure leaving the container, not children
    if (e.currentTarget === e.target) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    processFile(file);
  };

  const handleTestXml = useCallback(async () => {
    if (contributionsDisabled) {
      setErrorTitle('Contributions Disabled');
      setError(disabledContributionMessage);
      setShowErrorToast(true);
      return;
    }

    if (!xmlData) {
      setErrorTitle('XML required');
      setError('Choose a contribution XML file before preparing the test.');
      setShowErrorToast(true);
      return;
    }

    setError('');
    setShowErrorToast(false);
    setIsValidating(true);

    try {
      const sourceXml = originalXmlData || xmlData;
      if (!isFsDataXml(sourceXml)) {
        throw new Error('This file does not contain editable BARS FSData XML.');
      }
      const currentDraftHash = await draftHash(sourceXml);
      if (expectedDraftHash && currentDraftHash !== expectedDraftHash) {
        throw new Error(
          'The XML changed after leaving the editor. Return to the editor and test the current version.'
        );
      }
      // Create FormData to match the format used in DebugGenerator
      const formData = new FormData();
      const blob = new Blob([xmlData], { type: 'application/xml' });
      const file = new File([blob], selectedFile?.name || originalFileName || 'upload.xml', {
        type: 'application/xml',
      });
      formData.append('xmlFile', file);
      formData.append('icao', icao);
      formData.append('simulator', simulator);

      // Send XML data to the same endpoint used in DebugGenerator
      const response = await fetch(`https://v2.stopbars.com/supports/generate`, {
        method: 'POST',
        body: formData,
      });

      // Check for rate limiting before trying to parse JSON
      if (response.status === 429) {
        setErrorTitle('Rate Limited');
        setError('You are being rate limited, please try again shortly.');
        setShowErrorToast(true);
        setIsValidating(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unable to prepare the test.');
      }

      const data = await response.json();

      // MSFS returns previewable support geometry; X-Plane removals are applied locally.
      if (data.supportsXml) {
        setSupportsXmlData(data.supportsXml);
      }

      if (!data.token || !data.generationHash) {
        throw new Error(
          'Core did not return complete test proof. Try again after the Core contribution update is deployed.'
        );
      }
      setContributionToken(data.token);

      setIsXmlTested(true);
      setGenerationHash(data.generationHash);

      // Replace visualization XML with the generated BARS XML (keep original stored separately)
      setXmlData(data.barsXml);

      // Store original file name and size for passing forward
      if (selectedFile?.name) {
        setOriginalFileName(selectedFile.name);
        setOriginalFileSize(selectedFile.size);
      }

      // Fully reset the file upload
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Reset the file selection state, but keep the XML data for the map preview
      setSelectedFile(null);
    } catch (err) {
      setErrorTitle('Error');
      setError(err.message || 'Unable to prepare the test. Check the XML and try again.');
      setShowErrorToast(true);
      console.error('XML validation error:', err);
    } finally {
      setIsValidating(false);
    }
  }, [
    contributionsDisabled,
    disabledContributionMessage,
    expectedDraftHash,
    icao,
    originalFileName,
    originalXmlData,
    selectedFile,
    simulator,
    xmlData,
  ]);

  useEffect(() => {
    if (
      !shouldAutoPrepare ||
      !policyChecked ||
      contributionsDisabled ||
      autoPrepareAttemptedRef.current
    ) {
      return;
    }

    autoPrepareAttemptedRef.current = true;
    void handleTestXml();
  }, [contributionsDisabled, handleTestXml, policyChecked, shouldAutoPrepare]);

  useEffect(() => {
    if (isXmlTested) void preloadRoute(`/contribute/details/${icao}`);
  }, [icao, isXmlTested]);

  const handleTogglePolyLines = () => {
    if (showRemoveAreas) {
      setShowRemoveAreas(false);
    }
    setShowPolyLines(!showPolyLines);
  };

  const handleToggleRemoveAreas = () => {
    if (showPolyLines) {
      // Can't show both, so turn off poly lines if it's on
      setShowPolyLines(false);
    }
    setShowRemoveAreas((current) => !current);
  };

  const handleOpenPilotClientTest = () => {
    if (!isXmlTested || !contributionToken) return;

    const testUrl = `bars://test?token=${encodeURIComponent(contributionToken)}${
      generationHash ? `&draftHash=${encodeURIComponent(generationHash)}` : ''
    }`;
    window.open(testUrl, '_blank', 'noopener,noreferrer');
  };

  const handleContinue = () => {
    if (contributionsDisabled) {
      setErrorTitle('Contributions Disabled');
      setError(disabledContributionMessage);
      setShowErrorToast(true);
      return;
    }

    // Only allow navigation if XML has been tested and is valid
    if (isXmlTested && !error) {
      navigate(`/contribute/details/${icao}`, {
        state: {
          originalXml: originalXmlData,
          fileName: originalFileName || `${icao}.xml`,
          simulator,
          generationToken: contributionToken,
          generationHash,
        },
      });
    } else {
      setErrorTitle('Error');
      setError('Prepare the contribution test before continuing.');
      setShowErrorToast(true);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <ContributionFlowHeader
            current="test"
            title="Test contribution"
            icao={icao}
            context={airportName ? `${icao} · ${airportName}` : icao}
          />

          {contributionsDisabled && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center">
              <X className="w-5 h-5 text-amber-400 mr-3 shrink-0" />
              <p className="text-sm text-amber-400">{disabledContributionMessage}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-medium">Preview</h2>
                </div>

                {xmlData || (showRemoveAreas && supportsXmlData) ? (
                  <StableXMLMap
                    xmlData={xmlData}
                    removeAreasXmlData={supportsXmlData}
                    height="500px"
                    showPolyLines={showPolyLines}
                    showRemoveAreas={showRemoveAreas}
                    removeAreasStyle="fill"
                  />
                ) : (
                  <div className="h-125 flex items-center justify-center bg-zinc-800/30 rounded-lg">
                    <div className="text-center text-zinc-400">
                      <FileSearch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Choose contribution XML to preview.</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6" aria-busy={isValidating}>
                <h2 className="text-xl font-medium mb-4">Contribution XML</h2>
                <label
                  htmlFor="contribution-draft-file"
                  className={`block w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-blue-400 bg-blue-500/10'
                      : isXmlTested
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : selectedFile
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-zinc-600 bg-zinc-800/50 hover:bg-zinc-800/80'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {isXmlTested ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                        <Check className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="font-medium mb-1">{originalFileName || `${icao}.xml`}</p>
                      <p className="text-sm text-zinc-400">
                        {(originalFileSize / 1024).toFixed(1)} KB · Select to replace
                      </p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                        <Check className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="font-medium mb-1">{selectedFile.name}</p>
                      <p className="text-sm text-zinc-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB · Select to replace
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-zinc-700/50 rounded-full flex items-center justify-center mb-3">
                        <FileUp className="w-6 h-6 text-zinc-400" />
                      </div>
                      <p className="font-medium mb-1">
                        {isDragActive ? 'Drop the XML here' : 'Choose an XML file'}
                      </p>
                      <p className="text-sm text-zinc-400">or drag one here · max 5 MB</p>
                    </div>
                  )}
                  <input
                    id="contribution-draft-file"
                    type="file"
                    aria-label="Choose contribution XML file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xml"
                    className="hidden"
                  />
                </label>

                {/* Test XML actions */}
                {isXmlTested ? (
                  <Button
                    onClick={handleOpenPilotClientTest}
                    variant="outline"
                    className={`mt-4 w-full ${
                      !contributionToken ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={!contributionToken}
                  >
                    <span>Open in BARS Pilot Client</span>
                    <ExternalLink className="h-5 w-5 min-w-5 shrink-0" strokeWidth={2.5} />
                  </Button>
                ) : (
                  <Button
                    onClick={handleTestXml}
                    disabled={contributionsDisabled || isValidating}
                    className="mt-4 w-full"
                  >
                    {isValidating ? (
                      <div className="flex items-center justify-center">
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        <span>Preparing test…</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <FileSearch className="w-4 h-4 mr-2" />
                        <span>Prepare test</span>
                      </div>
                    )}
                  </Button>
                )}
              </Card>

              {isXmlTested ? (
                <Card className="p-5">
                  <h2 className="mb-3 text-sm font-medium text-zinc-300">Preview options</h2>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleTogglePolyLines}
                      aria-pressed={showPolyLines}
                      className={`flex min-h-11 w-full items-center rounded-lg border px-3 transition-[background-color,border-color,color] ${
                        showPolyLines
                          ? 'border-blue-500/60 bg-blue-500/10'
                          : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                      }`}
                      title="Show connecting lines between points in the same object"
                    >
                      <Spline className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                      <span className="ml-2.5 flex-1 text-left text-sm font-medium text-white">
                        Connection lines
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          showPolyLines ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'
                        }`}
                        aria-hidden="true"
                      >
                        {showPolyLines && <Check className="w-3.5 h-3.5 text-white" />}
                      </span>
                    </button>

                    {simulator !== 'xplane' && supportsXmlData ? (
                      <>
                        <button
                          type="button"
                          onClick={handleToggleRemoveAreas}
                          aria-pressed={showRemoveAreas}
                          className={`flex min-h-11 w-full items-center rounded-lg border px-3 transition-[background-color,border-color,color] ${
                            showRemoveAreas
                              ? 'border-blue-500/60 bg-blue-500/10'
                              : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                          }`}
                          title="Show filled areas that will hide default simulator lights"
                        >
                          <X className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                          <span className="ml-2.5 flex-1 text-left text-sm font-medium text-white">
                            Removal areas
                          </span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              showRemoveAreas ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'
                            }`}
                            aria-hidden="true"
                          >
                            {showRemoveAreas && <Check className="w-3.5 h-3.5 text-white" />}
                          </span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </Card>
              ) : null}

              {/* Continue button */}
              <Button
                onClick={handleContinue}
                className={`w-full ${
                  contributionsDisabled || !isXmlTested ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={contributionsDisabled || !isXmlTested || !!error}
              >
                <span>Continue to submit</span>
                <ArrowRight className="motion-forward h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Toast */}
      <Toast
        title={errorTitle}
        description={error}
        variant="destructive"
        show={showErrorToast}
        onClose={() => {
          setShowErrorToast(false);
          setError('');
          setErrorTitle('Error');
        }}
      />
    </Layout>
  );
};

function detectDraftSimulator(xml) {
  return /<FSData\b[^>]*\bsimulator\s*=\s*["']xplane["']/i.test(String(xml ?? ''))
    ? 'xplane'
    : 'msfs2024';
}

export default ContributeTest;
