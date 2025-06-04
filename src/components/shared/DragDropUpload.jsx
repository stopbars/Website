import { useState, useCallback } from 'react';
import { Upload, FileCheck } from 'lucide-react';
import { Button } from '../shared/Button';
import PropTypes from 'prop-types';

const DragDropUpload = ({ onFileUpload, acceptedFiles = '.xml', currentFile = null }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      setFileName(file.name);
      onFileUpload({ target: { files: [file] } });
    }
  }, [onFileUpload]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onFileUpload(e);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-8 transition-colors duration-200 ${
        isDragging 
          ? 'border-emerald-500 bg-emerald-500/10' 
          : 'border-zinc-700 hover:border-zinc-600'
      }`}
    >
      <div className="flex flex-col items-center">
        {currentFile ? (
          <div className="p-4 w-full bg-zinc-800 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-emerald-400">
              <FileCheck className="w-4 h-4" />
              <span>File uploaded successfully: {fileName}</span>
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-12 h-12 text-zinc-400 mb-4" />
            <p className="text-sm text-zinc-400 text-center mb-4">
              Drag and drop your file here, or click to select
            </p>
            <input
              type="file"
              accept={acceptedFiles}
              onChange={handleFileSelect}
              className="hidden"
              id="xml-upload"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => document.getElementById('xml-upload').click()}
            >
              Select File
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

DragDropUpload.propTypes = {
    onFileUpload: PropTypes.func.isRequired,
    acceptedFiles: PropTypes.string,
    currentFile: PropTypes.object
};

export default DragDropUpload;