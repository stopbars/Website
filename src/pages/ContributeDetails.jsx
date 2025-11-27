import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { Breadcrumb, BreadcrumbItem } from '../components/shared/Breadcrumb';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from '../hooks/useWindowSize';
import { ArrowRight, FileUp, Upload, Check, Loader, Search, UserPen, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';

const ContributeDetails = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const vatsimToken = getVatsimToken();

  const [sceneryName, setSceneryName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [preloaded, setPreloaded] = useState(false);
  const [airport, setAirport] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('Error');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [topPackages, setTopPackages] = useState([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [allPackages, setAllPackages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { width, height } = useWindowSize();
  const [confettiRun, setConfettiRun] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

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
        setPreloaded(true);
      } catch (e) {
        console.error('Failed to preload tested XML:', e);
      }
    }
  }, [location.state, preloaded, icao]);

  // Fetch airport information
  useEffect(() => {
    const fetchAirport = async () => {
      try {
        const response = await fetch(`https://v2.stopbars.com/airports?icao=${icao}`);
        if (response.ok) {
          const data = await response.json();
          setAirport({
            icao: data.icao,
            name: data.name,
            latitude: data.latitude,
            longitude: data.longitude,
          });
        }
      } catch (error) {
        console.error('Error fetching airport:', error);
      }
    };

    fetchAirport();
  }, [icao]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      setErrorTitle('Error');
      setError('You must be logged in to submit a contribution');
      setShowErrorToast(true);
      return;
    }

    if (!sceneryName) {
      setErrorTitle('Error');
      setError('Please select or enter a scenery name');
      setShowErrorToast(true);
      return;
    }

    if (!selectedFile) {
      setErrorTitle('Error');
      setError('Please upload an XML file');
      setShowErrorToast(true);
      return;
    }

    setError('');
    setShowErrorToast(false);
    setIsSubmitting(true);

    try {
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(selectedFile);
      });

      const payload = {
        airportIcao: icao,
        packageName: sceneryName,
        submittedXml: fileContent,
        notes: notes || undefined,
      };

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
      setErrorTitle('Submission Failed');
      setError(err.message || 'Failed to submit contribution, please try again.');
      setShowErrorToast(true);
      console.error('Submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
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
          tweenDuration={1000}
          initialVelocityY={20}
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
              <h1 className="text-2xl font-bold mb-6">Submission Successful</h1>
              <p className="text-zinc-400 mb-8">
                Thank you for contributing to BARS! Your submission for {icao} will be reviewed by
                our team.
              </p>
              <div className="flex justify-center">
                <Button onClick={() => navigate('/contribute')}>
                  Contribution Dashboard
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
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 mt-6">
            <div className="flex items-center space-x-2 mb-1">
              <Breadcrumb>
                <BreadcrumbItem title="Map" link={`/contribute/map/${icao}`} />
                <BreadcrumbItem title="Test" link={`/contribute/test/${icao}`} />
                <BreadcrumbItem title="Details" />
              </Breadcrumb>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <div className="lg:col-span-2">
              <Card className="p-6 h-full">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Scenery package selection */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Scenery Package</label>
                    {isLoadingPackages ? (
                      <>
                        <div className="relative">
                          <div className="flex items-center relative">
                            <input
                              type="text"
                              disabled
                              placeholder="Enter scenery name (e.g., FlyTampa, iniBuilds)"
                              className="w-full px-4 py-2 pl-10 bg-zinc-800 border border-zinc-700 rounded-lg opacity-50 cursor-not-allowed"
                            />
                            <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
                          </div>
                        </div>

                        {/* Skeleton for Top Packages */}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {[...Array(6)].map((_, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 animate-pulse"
                            >
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <div className="shrink-0 w-6 h-6 rounded-full bg-zinc-700/50"></div>
                                <div className="h-[18px] bg-zinc-700/50 rounded flex-1 max-w-[60%]"></div>
                              </div>
                              <div className="text-right ml-2 shrink-0 space-y-1">
                                <div className="h-[18px] w-8 bg-zinc-700/50 rounded ml-auto"></div>
                                <div className="h-3.5 w-16 bg-zinc-700/50 rounded"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
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
                              maxLength={64}
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
                          )}
                        </div>

                        {/* Top Packages */}
                        {topPackages.length > 0 && (
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {topPackages.map((pkg, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => {
                                  setSceneryName(pkg.packageName);
                                  setShowSuggestions(false);
                                }}
                                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800/70 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center space-x-3 min-w-0">
                                  <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-blue-500/20">
                                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                                  </div>
                                  <div className="font-medium text-left text-sm truncate">
                                    {pkg.packageName}
                                  </div>
                                </div>
                                <div className="text-right ml-2 shrink-0">
                                  <div className="font-semibold text-sm">{pkg.count}</div>
                                  <div className="text-xs text-zinc-400">
                                    contribution{pkg.count !== 1 ? 's' : ''}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Additional notes */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Additional Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes for the approval team."
                      maxLength={1000}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 min-h-[100px] resize-none"
                    ></textarea>
                  </div>

                  {/* Contribution Acknowledgement */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setAcknowledged(!acknowledged)}
                      className={`w-full flex items-start p-4 rounded-xl border transition-all duration-200 ${
                        acknowledged
                          ? 'border-emerald-500/60 bg-emerald-500/5 shadow-sm shadow-emerald-500/10'
                          : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600 hover:bg-zinc-800/60'
                      }`}
                    >
                      {/* Icon Container */}
                      <div
                        className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          acknowledged ? 'bg-emerald-500/15' : 'bg-zinc-700/40'
                        }`}
                      >
                        <UserPen
                          className={`w-5 h-5 ${acknowledged ? 'text-emerald-400' : 'text-zinc-400'}`}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 mx-4 text-left">
                        <span className="text-sm font-semibold block mb-1.5 text-white">
                          Contribution Acknowledgement
                        </span>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          By submitting this contribution, you agree that you have followed the
                          contribution guide, to create the best possible, tested, and working
                          contribution you can submit, verifying no issues occur within the
                          submission, and that this work is your own and is linked to your BARS
                          account.
                        </p>
                      </div>

                      {/* Checkbox Container */}
                      <div
                        className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                          acknowledged
                            ? 'border-emerald-500 bg-emerald-500 shadow-sm'
                            : 'border-zinc-600 bg-transparent'
                        }`}
                      >
                        {acknowledged && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                      </div>
                    </button>
                  </div>
                </form>
              </Card>
            </div>

            <div className="flex flex-col justify-between space-y-6">
              <div className="space-y-6 flex-1 flex flex-col">
                {/* Airport Information */}
                <Card className="p-6">
                  <h2 className="text-xl font-medium mb-4">Airport Information</h2>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-zinc-400">ICAO Code</p>
                      <p className="font-medium">{icao.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-400">Airport Name</p>
                      <p className="font-medium">{airport ? airport.name : 'Loading...'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-400">Location</p>
                      <p className="font-medium">
                        {airport
                          ? `${airport.latitude.toFixed(4)}, ${airport.longitude.toFixed(4)}`
                          : 'Loading...'}
                      </p>
                    </div>
                    <div></div>
                  </div>
                </Card>

                {/* XML File */}
                <Card className="p-6 flex-1 flex flex-col">
                  <h2 className="text-xl font-medium mb-4">XML File</h2>
                  <div className="flex-1 flex items-center">
                    <div
                      className={`w-full border-2 border-dashed rounded-lg p-6 text-center ${
                        selectedFile
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-zinc-600 bg-zinc-800/50'
                      }`}
                    >
                      {selectedFile ? (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                            <Check className="w-6 h-6 text-emerald-500" />
                          </div>
                          <p className="font-medium mb-1">{selectedFile.name}</p>
                          <p className="text-sm text-zinc-400">
                            {(selectedFile.size / 1024).toFixed(1)} KB • File loaded from previous
                            step
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-zinc-700/50 rounded-full flex items-center justify-center mb-3">
                            <FileUp className="w-6 h-6 text-zinc-400" />
                          </div>
                          <p className="font-medium mb-1 text-zinc-400">No XML file loaded</p>
                          <p className="text-sm text-zinc-500">
                            Please go back and test your XML file
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Submit button */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedFile || !sceneryName || !acknowledged}
                className={`w-full ${isSubmitting || !selectedFile || !sceneryName || !acknowledged ? 'opacity-40 cursor-not-allowed' : ''}`}
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

export default ContributeDetails;
