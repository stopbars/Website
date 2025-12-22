import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Breadcrumb, BreadcrumbItem } from '../components/shared/Breadcrumb';
import { Toast } from '../components/shared/Toast';
import XMLMap from '../components/shared/XMLMap';
import { ChevronRight, FileUp, Check, Loader, FileSearch, Spline, X } from 'lucide-react';

const ContributeTest = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [originalFileName, setOriginalFileName] = useState('');
  const [originalFileSize, setOriginalFileSize] = useState(0);
  const [xmlData, setXmlData] = useState('');
  const [originalXmlData, setOriginalXmlData] = useState('');
  const [supportsXmlData, setSupportsXmlData] = useState('');
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('Error');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isXmlTested, setIsXmlTested] = useState(false);
  const [showPolyLines, setShowPolyLines] = useState(false);
  const [showRemoveAreas, setShowRemoveAreas] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const processFile = (file) => {
    if (!file) {
      setSelectedFile(null);
      setXmlData('');
      return;
    }

    // Check file extension
    const validExtensions = ['.xml'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      setErrorTitle('Error');
      setError('Please upload an XML file');
      setShowErrorToast(true);
      setSelectedFile(null);
      setXmlData('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorTitle('Error');
      setError('XML file size must be less than 5MB');
      setShowErrorToast(true);
      setSelectedFile(null);
      setXmlData('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError('');
    setShowErrorToast(false);
    setSelectedFile(file);
    setIsXmlTested(false);

    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
      setXmlData(e.target.result);
      setOriginalXmlData(e.target.result);
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

  const handleTestXml = async () => {
    if (!xmlData) {
      setErrorTitle('Error');
      setError('Please upload an XML file first');
      setShowErrorToast(true);
      return;
    }

    setError('');
    setShowErrorToast(false);
    setIsValidating(true);

    try {
      // Create FormData to match the format used in DebugGenerator
      const formData = new FormData();
      const blob = new Blob([xmlData], { type: 'application/xml' });
      const file = new File([blob], selectedFile?.name || originalFileName || 'upload.xml', {
        type: 'application/xml',
      });
      formData.append('xmlFile', file);
      formData.append('icao', icao);

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
        throw new Error(errorData.error || 'Failed to generate files');
      }

      const data = await response.json();

      // Store the supports XML for the "Remove Areas" toggle
      if (data.supportsXml) {
        setSupportsXmlData(data.supportsXml);
      }

      setIsXmlTested(true);

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
      setError(err.message || 'Failed to validate XML, please check the file format.');
      setShowErrorToast(true);
      console.error('XML validation error:', err);
    } finally {
      setIsValidating(false);
    }
  };

  const handleTogglePolyLines = () => {
    if (showRemoveAreas) {
      // Can't show both, so turn off remove areas if it's on
      setShowRemoveAreas(false);
    }
    setShowPolyLines(!showPolyLines);
  };

  const handleToggleRemoveAreas = () => {
    if (showPolyLines) {
      // Can't show both, so turn off poly lines if it's on
      setShowPolyLines(false);
    }
    setShowRemoveAreas(!showRemoveAreas);
  };

  const handleContinue = () => {
    // Only allow navigation if XML has been tested and is valid
    if (isXmlTested && !error) {
      navigate(`/contribute/details/${icao}`, {
        state: {
          originalXml: originalXmlData,
          fileName: originalFileName || `${icao}.xml`,
        },
      });
    } else {
      setErrorTitle('Error');
      setError('Please test your XML file before continuing');
      setShowErrorToast(true);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 mt-6">
            <div className="flex items-center space-x-2 mb-1">
              <Breadcrumb>
                <BreadcrumbItem title="Airport" link="/contribute/new" />
                <BreadcrumbItem title="Map" link={`/contribute/map/${icao}`} />
                <BreadcrumbItem title="Test" />
              </Breadcrumb>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {/* XML Map Preview */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-medium">XML Preview</h2>
                </div>

                {xmlData || (showRemoveAreas && supportsXmlData) ? (
                  <XMLMap
                    xmlData={showRemoveAreas ? supportsXmlData : xmlData}
                    height="500px"
                    showPolyLines={showPolyLines}
                    showRemoveAreas={showRemoveAreas}
                  />
                ) : (
                  <div className="h-125 flex items-center justify-center bg-zinc-800/30 rounded-lg">
                    <div className="text-center text-zinc-400">
                      <FileSearch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Upload an XML file to preview</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              {/* File Upload */}
              <Card className="p-6">
                <h2 className="text-xl font-medium mb-4">Upload XML File</h2>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-blue-400 bg-blue-500/10'
                      : isXmlTested
                        ? 'border-emerald-500/50 bg-emerald-500/5'
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
                  {isXmlTested ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                        <Check className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="font-medium mb-1">{originalFileName || `${icao}.xml`}</p>
                      <p className="text-sm text-zinc-400">
                        {(originalFileSize / 1024).toFixed(1)} KB • Click to reupload
                      </p>
                    </div>
                  ) : selectedFile ? (
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

                {/* Test XML button */}
                <Button
                  onClick={handleTestXml}
                  disabled={!xmlData || isValidating || isXmlTested}
                  className="mt-4 w-full"
                >
                  {isValidating ? (
                    <div className="flex items-center justify-center">
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      <span>Testing XML...</span>
                    </div>
                  ) : isXmlTested ? (
                    <div className="flex items-center justify-center">
                      <Check className="w-4 h-4 mr-2" />
                      <span>XML Tested</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <FileSearch className="w-4 h-4 mr-2" />
                      <span>Test XML</span>
                    </div>
                  )}
                </Button>
              </Card>

              {/* Map Settings */}
              <Card className="p-6">
                <h2 className="text-xl font-medium mb-4">Map Settings</h2>
                <div className="space-y-3">
                  {/* Toggle Polylines Button */}
                  <button
                    onClick={handleTogglePolyLines}
                    disabled={!isXmlTested}
                    className={`w-full flex items-center p-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                      !isXmlTested
                        ? 'opacity-40 cursor-not-allowed bg-zinc-800/30 border-zinc-700'
                        : showPolyLines
                          ? 'border-blue-500 bg-zinc-800/50 hover:bg-zinc-800/70'
                          : 'border-zinc-600 bg-zinc-800/30 hover:bg-zinc-800/50'
                    }`}
                    title="Show connecting lines between points in the same object"
                  >
                    {/* Icon Container */}
                    <div
                      className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                        !isXmlTested
                          ? 'bg-zinc-700/50'
                          : showPolyLines
                            ? 'bg-blue-500/20'
                            : 'bg-zinc-700/50'
                      }`}
                    >
                      <Spline
                        className={`w-4 h-4 ${
                          !isXmlTested
                            ? 'text-zinc-500'
                            : showPolyLines
                              ? 'text-blue-400'
                              : 'text-zinc-400'
                        }`}
                      />
                    </div>

                    {/* Title */}
                    <div className="flex-1 ml-2.5 text-left">
                      <span
                        className={`text-sm font-medium ${!isXmlTested ? 'text-zinc-500' : 'text-white'}`}
                      >
                        Toggle Polylines
                      </span>
                    </div>

                    {/* Checkbox Container */}
                    <div
                      className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        !isXmlTested
                          ? 'border-zinc-600 bg-zinc-700/30'
                          : showPolyLines
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-zinc-500 bg-transparent'
                      }`}
                    >
                      {showPolyLines && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>

                  {/* Toggle Remove Areas Button */}
                  <button
                    onClick={handleToggleRemoveAreas}
                    disabled={!isXmlTested || !supportsXmlData}
                    className={`w-full flex items-center p-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                      !isXmlTested || !supportsXmlData
                        ? 'opacity-40 cursor-not-allowed bg-zinc-800/30 border-zinc-700'
                        : showRemoveAreas
                          ? 'border-blue-500 bg-zinc-800/50 hover:bg-zinc-800/70'
                          : 'border-zinc-600 bg-zinc-800/30 hover:bg-zinc-800/50'
                    }`}
                    title="Show remove areas that will hide default simulator lights"
                  >
                    {/* Icon Container */}
                    <div
                      className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                        !isXmlTested || !supportsXmlData
                          ? 'bg-zinc-700/50'
                          : showRemoveAreas
                            ? 'bg-blue-500/20'
                            : 'bg-zinc-700/50'
                      }`}
                    >
                      <X
                        className={`w-4 h-4 ${
                          !isXmlTested || !supportsXmlData
                            ? 'text-zinc-500'
                            : showRemoveAreas
                              ? 'text-blue-400'
                              : 'text-zinc-400'
                        }`}
                      />
                    </div>

                    {/* Title */}
                    <div className="flex-1 ml-2.5 text-left">
                      <span
                        className={`text-sm font-medium ${
                          !isXmlTested || !supportsXmlData ? 'text-zinc-500' : 'text-white'
                        }`}
                      >
                        Toggle Remove Areas
                      </span>
                    </div>

                    {/* Checkbox Container */}
                    <div
                      className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        !isXmlTested || !supportsXmlData
                          ? 'border-zinc-600 bg-zinc-700/30'
                          : showRemoveAreas
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-zinc-500 bg-transparent'
                      }`}
                    >
                      {showRemoveAreas && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                </div>
              </Card>

              {/* Continue button */}
              <Button
                onClick={handleContinue}
                className={`w-full ${!isXmlTested ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!isXmlTested || !!error}
              >
                <span>Continue to Next Step</span>
                <ChevronRight className="w-4 h-4 ml-2" />
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

export default ContributeTest;
