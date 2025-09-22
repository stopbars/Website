import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from '../hooks/useWindowSize';
import {
  AlertCircle,
  ChevronLeft,
  ArrowRight,
  FileUp,
  Upload,
  Check,
  Loader,
  Info,
  Search,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';

const ContributeDetails = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const vatsimToken = getVatsimToken();

  const [sceneryName, setSceneryName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [preloaded, setPreloaded] = useState(false);
  const [testedOriginalXml, setTestedOriginalXml] = useState(''); // raw XML that was previously tested
  const [isFileDifferent, setIsFileDifferent] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [topPackages, setTopPackages] = useState([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [allPackages, setAllPackages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { width, height } = useWindowSize();
  const [confettiRun, setConfettiRun] = useState(true);

  // Preload file from navigation state if provided
  useEffect(() => {
    // Only preload if we have the raw original XML passed from previous step
    if (!preloaded && location.state?.originalXml) {
      try {
        const { originalXml, fileName } = location.state;
        const blob = new Blob([originalXml], { type: 'application/xml' });
        const syntheticFile = new File([blob], fileName || `${icao}.xml`, {
          type: 'application/xml',
        });
        setSelectedFile(syntheticFile);
        setTestedOriginalXml(originalXml);
        setPreloaded(true);
      } catch (e) {
        console.error('Failed to preload tested XML:', e);
      }
    }
  }, [location.state, preloaded, icao]);

  // Fetch top packages when component loads
  useEffect(() => {
    const fetchTopPackages = async () => {
      setIsLoadingPackages(true);
      try {
        const response = await fetch('https://v2.stopbars.com/contributions/top-packages', {
          headers: {
            'X-Vatsim-Token': vatsimToken,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setTopPackages(data.slice(0, 6)); // Get top 6 packages
          setAllPackages(data.map((pkg) => pkg.packageName));
        }
      } catch (error) {
        console.error('Error fetching top packages:', error);
      } finally {
        setIsLoadingPackages(false);
      }
    };

    fetchTopPackages();
  }, [vatsimToken]);

  // (Display name feature removed)

  // Handle input change for scenery name with suggestions
  const handleSceneryNameChange = (e) => {
    const value = e.target.value;
    setSceneryName(value);

    if (value.length > 1) {
      const filteredSuggestions = allPackages
        .filter((pkg) => pkg.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 6);

      setSuggestions(filteredSuggestions);
      setShowSuggestions(filteredSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Select a suggestion
  const selectSuggestion = (suggestion) => {
    setSceneryName(suggestion);
    setShowSuggestions(false);
  };

  const validateAndSetFile = (file, resetInputCb) => {
    if (!file) {
      setSelectedFile(null);
      setIsFileDifferent(false);
      return;
    }
    const validExtensions = ['.xml'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      setError('Please select an XML file');
      setSelectedFile(null);
      if (resetInputCb) resetInputCb();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      setSelectedFile(null);
      if (resetInputCb) resetInputCb();
      return;
    }
    setError('');
    setSelectedFile(file);
    // Compare content to testedOriginalXml
    if (testedOriginalXml) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target.result;
        setIsFileDifferent(content !== testedOriginalXml);
      };
      reader.readAsText(file);
    } else {
      setIsFileDifferent(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    validateAndSetFile(file, () => {
      e.target.value = '';
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) setIsDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    validateAndSetFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      setError('You must be logged in to submit a contribution');
      return;
    }

    if (!sceneryName) {
      setError('Please select or enter a scenery name');
      return;
    }

    if (!selectedFile) {
      setError('Please upload an XML file');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      // Read the file content
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(selectedFile);
      });
      // Prepare the payload
      const payload = {
        airportIcao: icao,
        packageName: sceneryName,
        submittedXml: fileContent,
        notes: notes || undefined,
      };

      // Send to the API
      const response = await fetch('https://v2.stopbars.com/contributions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': vatsimToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit contribution');
      }

      setSubmissionSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to submit contribution');
      console.error('Submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(`/contribute/map/${icao}`);
  };

  if (submissionSuccess) {
    return (
      <Layout>
        <ReactConfetti
          width={width}
          height={height}
          numberOfPieces={700}
          recycle={false}
          run={confettiRun}
          tweenDuration={2000}
          onConfettiComplete={() => setConfettiRun(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 60,
            pointerEvents: 'none',
          }}
        />
        <div className="min-h-screen pt-32 pb-20 flex items-center">
          <div className="w-full max-w-3xl mx-auto px-6">
            <Card className="p-8 text-center">
              <div className="mx-auto w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                <Check className="w-8 h-8 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Submission Successful</h1>
              <p className="text-zinc-400 mb-6">
                Thank you for contributing to BARS! Your submission for {icao} will be reviewed by
                our team.
              </p>
              <div className="flex justify-center">
                <Button onClick={() => navigate('/contribute')}>
                  Visit Contribution Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-1">
              <Button variant="outline" onClick={handleBack} className="h-8 px-3">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <h1 className="text-3xl font-bold">{icao} Contribution</h1>
            </div>{' '}
            <p className="text-zinc-400">Step 4: Submit scenery details and XML data</p>
          </div>

          <Card className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Scenery package selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Scenery Package</label>
                {isLoadingPackages ? (
                  <div className="flex items-center space-x-2 py-4">
                    <Loader className="w-4 h-4 animate-spin text-blue-400" />
                    <span className="text-zinc-400">Loading popular scenery packages...</span>
                  </div>
                ) : (
                  <>
                    {' '}
                    {topPackages.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                        {' '}
                        {topPackages.map((pkg) => (
                          <Button
                            key={pkg.packageName}
                            type="button"
                            variant="outline"
                            className={`py-2 justify-center text-sm ${sceneryName === pkg.packageName ? 'bg-zinc-800 !border-blue-400 shadow-sm' : ''}`}
                            onClick={() => {
                              setSceneryName(pkg.packageName);
                              setShowSuggestions(false);
                            }}
                          >
                            {pkg.packageName}
                            <span className="ml-1 text-xs text-zinc-400">({pkg.count})</span>
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <div className="flex items-center relative">
                        <input
                          type="text"
                          value={sceneryName}
                          onChange={handleSceneryNameChange}
                          onFocus={() =>
                            sceneryName.length > 1 &&
                            setSuggestions(
                              allPackages
                                .filter((pkg) =>
                                  pkg.toLowerCase().includes(sceneryName.toLowerCase())
                                )
                                .slice(0, 6)
                            ) &&
                            setShowSuggestions(true)
                          }
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          placeholder="Enter scenery name (e.g., FlyTampa, iniBuilds)"
                          className="w-full px-4 py-2 pl-10 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                        <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
                      </div>
                      {showSuggestions && suggestions.length > 0 && (
                        <ul className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {suggestions.map((suggestion, index) => (
                            <li
                              key={index}
                              className="px-4 py-2 hover:bg-zinc-700 cursor-pointer"
                              onClick={() => selectSuggestion(suggestion)}
                            >
                              {suggestion}
                            </li>
                          ))}
                        </ul>
                      )}{' '}
                      <p className="mt-1 text-xs text-zinc-400">
                        {showSuggestions
                          ? 'Click a suggestion or continue typing'
                          : 'Type to search existing packages or enter a new package name (examples: FlyTampa, iniBuilds)'}
                      </p>
                      <p className="mt-1 text-xs text-blue-400">
                        <Info className="inline-block w-3 h-3 mr-1" />
                        If your scenery package isn&apos;t listed, simply type the name and submit
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* File upload */}
              <div>
                <label className="block text-sm font-medium mb-2">Upload XML File</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-blue-400 bg-blue-500/10'
                      : selectedFile
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-zinc-600 bg-zinc-800/50 hover:bg-zinc-800/80'
                  }`}
                  onClick={() => fileInputRef.current.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  role="button"
                  aria-label="Upload XML file via click or drag and drop"
                >
                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                        <Check className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="font-medium mb-1">{selectedFile.name}</p>
                      <p className="text-sm text-zinc-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Click to change
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-zinc-700/50 rounded-full flex items-center justify-center mb-3">
                        <FileUp className="w-6 h-6 text-zinc-400" />
                      </div>
                      <p className="font-medium mb-1">
                        {isDragActive ? 'Drop file to upload' : 'Click to select XML file'}
                      </p>
                      <p className="text-sm text-zinc-400">or drag and drop (max 5MB)</p>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xml"
                    className="hidden"
                  />
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
                    <Info className="w-5 h-5 text-blue-400 mr-2 flex-shrink-0" />
                    <p className="text-blue-400">
                      The XML file should contain the necessary stopbar and taxiway light
                      definitions for the scenery package.
                    </p>
                  </div>
                  {isFileDifferent && (
                    <div className="flex items-center p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                      <AlertCircle className="w-5 h-5 text-amber-400 mr-2 flex-shrink-0" />
                      <p className="text-amber-400">
                        This file&apos;s contents differ from the XML you tested on the previous
                        step. Please go back and retest if you intended to make changes.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Display Name field removed */}

              {/* Additional notes */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes for the approval team."
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 min-h-[100px]"
                ></textarea>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center space-x-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-red-500">{error}</p>
                </div>
              )}

              {/* Submit button */}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedFile || !sceneryName}
                  className="min-w-[150px]"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      <span>Submitting...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <Upload className="w-4 h-4 mr-2" />
                      <span>Submit Contribution</span>
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default ContributeDetails;
