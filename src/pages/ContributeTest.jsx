import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import XMLMap from '../components/shared/XMLMap';
import { 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  FileUp, 
  Check, 
  Loader, 
  Info,
  FileSearch,
  LineChart,
  SquareSlash
} from 'lucide-react';

const ContributeTest = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [xmlData, setXmlData] = useState('');
  const [supportsXmlData, setSupportsXmlData] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isXmlTested, setIsXmlTested] = useState(false);
  const [showPolyLines, setShowPolyLines] = useState(false);
  const [showRemoveAreas, setShowRemoveAreas] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    
    if (!file) {
      setSelectedFile(null);
      setXmlData('');
      return;
    }
    
    // Check file extension
    const validExtensions = ['.xml'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setError('Please select an XML file');
      setSelectedFile(null);
      setXmlData('');
      e.target.value = '';
      return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      setSelectedFile(null);
      setXmlData('');
      e.target.value = '';
      return;
    }
    
    setError('');
    setSelectedFile(file);
    setIsXmlTested(false);
    
    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
      setXmlData(e.target.result);
      // Reset visualization toggles when new file is loaded
      setShowPolyLines(false);
      setShowRemoveAreas(false);
    };
    reader.readAsText(file);
  };

  const handleTestXml = async () => {
    if (!xmlData) {
      setError('Please upload an XML file first');
      return;
    }
    
    setError('');
    setIsValidating(true);
    
    try {
      // Create FormData to match the format used in DebugGenerator
      const formData = new FormData();
      const blob = new Blob([xmlData], { type: 'application/xml' });
      const file = new File([blob], selectedFile.name || 'upload.xml', { type: 'application/xml' });
      formData.append('xmlFile', file);
      formData.append('icao', icao);
      
      // Send XML data to the same endpoint used in DebugGenerator
      const response = await fetch(`https://v2.stopbars.com/supports/generate`, {
        method: 'POST',
        body: formData
      });
      
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
      
      // Set the XML data for visualization
      setXmlData(data.barsXml);
      
      // Fully reset the file upload
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Reset the file selection state, but keep the XML data for the map preview
      setSelectedFile(null);
    } catch (err) {
      setError(err.message || 'Failed to validate XML. Please check the file format.');
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

  const handleBack = () => {
    navigate(`/contribute/map/${icao}`);
  };

  const handleContinue = () => {
    // Only allow navigation if XML has been tested and is valid
    if (isXmlTested && !error) {
      navigate(`/contribute/details/${icao}`);
    } else {
      setError('Please test your XML file before continuing');
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-1">
              <Button variant="outline" onClick={handleBack} className="h-8 px-3">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <h1 className="text-3xl font-bold">{icao} Contribution</h1>
            </div>
            <p className="text-zinc-400">
              Step 3: Test your XML file
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {/* XML Map Preview */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-medium">XML Preview</h2>
                    {/* Visualization Toggle Buttons */}
                  {isXmlTested && (
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTogglePolyLines}
                        className={`h-8 ${showPolyLines ? 'bg-zinc-800 !border-blue-400 shadow-sm' : ''}`}
                        title="Show connecting lines between points in the same object"
                      >
                        <LineChart className="w-4 h-4 mr-1" />
                        <span>Toggle Poly Lines</span>
                      </Button>
                      
                      {supportsXmlData && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleToggleRemoveAreas}
                          className={`h-8 ${showRemoveAreas ? 'bg-zinc-800 !border-blue-400 shadow-sm' : ''}`}
                          title="Show remove areas that will hide default simulator lights"
                        >
                          <SquareSlash className="w-4 h-4 mr-1" />
                          <span>Toggle Remove Areas</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                
                {(xmlData || (showRemoveAreas && supportsXmlData)) ? (
                  <XMLMap 
                    xmlData={showRemoveAreas ? supportsXmlData : xmlData}
                    height="500px"
                    showPolyLines={showPolyLines}
                    showRemoveAreas={showRemoveAreas}
                  />
                ) : (
                  <div className="h-[500px] flex items-center justify-center bg-zinc-800/30 rounded-lg">
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
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                    selectedFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-600 bg-zinc-800/50 hover:bg-zinc-800/80'
                  }`}
                  onClick={() => fileInputRef.current.click()}
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
                      <p className="font-medium mb-1">Click to select XML file</p>
                      <p className="text-sm text-zinc-400">
                        or drag and drop (max 5MB)
                      </p>
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
              
              {/* Error message */}
              {error && (
                <div className="flex items-center space-x-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-red-500">{error}</p>
                </div>
              )}
              
              {/* Testing Guide */}
              <Card className="p-6">
                <h2 className="text-xl font-medium mb-4">Testing Guide</h2>
                <div className="space-y-4 text-sm">
                  <div className="flex">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium">1</span>
                    </div>
                    <p className="text-zinc-300">
                      Upload the XML file for your scenery package
                    </p>
                  </div>
                  <div className="flex">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium">2</span>
                    </div>
                    <p className="text-zinc-300">
                      Click the &quot;Test XML&quot; button to validate the file
                    </p>
                  </div>
                  <div className="flex">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium">3</span>
                    </div>
                    <p className="text-zinc-300">
                      Review the validation results and verify the points on the map
                    </p>
                  </div>
                  <div className="flex">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium">4</span>
                    </div>
                    <p className="text-zinc-300">
                      Use visualization options to inspect your contribution
                    </p>
                  </div>
                  <div className="flex">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium">5</span>
                    </div>
                    <p className="text-zinc-300">
                      If the XML is valid, continue to the next step
                    </p>
                  </div>
                </div>
              </Card>
              
              {/* Info banner */}
              <div className="flex items-center p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Info className="w-5 h-5 text-blue-400 mr-3 flex-shrink-0" />
                <p className="text-sm text-blue-400">
                  Testing your XML file ensures it&apos;s compatible with BARS and helps maintain quality contributions.
                </p>
              </div>
              
              {/* Error message */}
              {error && (
                <div className="flex items-center space-x-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-red-500">{error}</p>
                </div>
              )}
              
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
    </Layout>
  );
};

export default ContributeTest;
