'use client';

import { useState } from 'react';

const ExcelUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData,
        // Add timeout for large files
        signal: AbortSignal.timeout(300000) // 5 minute timeout for large files
      });

      // Enhanced JSON parsing with better error handling
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          result = await response.json();
        } catch (jsonError) {
          // JSON parsing failed - likely truncated or malformed response
          const text = await response.text();
          result = { 
            error: 'Invalid JSON response from server', 
            details: `Response appears corrupted. Status: ${response.status}. Content preview: ${text.substring(0, 200)}...` 
          };
        }
      } else {
        // Server returned non-JSON response (HTML error page, timeout, etc.)
        const text = await response.text();
        const isTimeout = text.includes('504') || text.includes('timeout') || text.includes('Time-out');
        const isMemory = text.includes('memory') || text.includes('heap') || text.includes('allocation');
        
        if (isTimeout) {
          result = { 
            error: 'Upload timeout - File too large or server overloaded', 
            details: 'Try uploading a smaller file or fewer records at once',
            suggestion: 'Consider splitting your Excel file into smaller chunks with fewer rows'
          };
        } else if (isMemory) {
          result = { 
            error: 'Server memory limit exceeded', 
            details: 'Your Excel file is too large for the server to process',
            suggestion: 'Try uploading a file with fewer rows or optimize the data'
          };
        } else {
          result = { 
            error: 'Server error - Non-JSON response received', 
            details: `Status: ${response.status}. Content preview: ${text.substring(0, 200)}...`,
            suggestion: 'Check server logs for detailed error information'
          };
        }
      }

      if (response.ok && result.success) {
        setMessage(`✅ ${result.message}\n📊 Inserted: ${JSON.stringify(result.insertedData, null, 2)}\n📋 Sheets found: ${result.sheets.join(', ')}`);
        setFile(null);
        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        const errorParts = [`❌ Error: ${result.error}`];
        if (result.details) errorParts.push(`📝 Details: ${result.details}`);
        if (result.suggestion) errorParts.push(`💡 Suggestion: ${result.suggestion}`);
        if (result.fileInfo) errorParts.push(`📄 File: ${result.fileInfo.name} (${result.fileInfo.size})`);
        setMessage(errorParts.join('\n\n'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      
      // Enhanced error handling for different error types
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setMessage(`❌ Upload timeout: Your file is too large or the server is busy. Try uploading a smaller file with fewer rows.`);
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        setMessage(`❌ Network error: Unable to connect to server. Check your internet connection and try again.`);
      } else if (error instanceof SyntaxError && error.message.includes('JSON')) {
        setMessage(`❌ Server response error: The server returned invalid data. This usually happens with very large files. Try uploading a smaller file.`);
      } else {
        setMessage(`❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Upload Excel Test Data</h2>
      <p className="text-gray-600 mb-6">Upload an Excel file with multiple sheets to test the AI suggestions system</p>

      {/* File Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Choose Excel File
        </label>
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className={`w-full py-2 px-4 rounded-md font-medium ${
          !file || uploading
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {uploading ? 'Uploading...' : 'Upload Data'}
      </button>

      {/* Message */}
      {message && (
        <div className={`mt-4 p-3 rounded-md ${
          message.includes('✅') 
            ? 'bg-green-100 text-green-700 border border-green-300' 
            : 'bg-red-100 text-red-700 border border-red-300'
        }`}>
          {message}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-3 bg-gray-50 rounded-md">
        <h3 className="font-semibold text-gray-700 mb-2">Excel Format Requirements:</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li><strong>Inventory sheet:</strong> port, type, stock (or Vietnamese: cảng, loại, số lượng)</li>
          <li><strong>Booking sheet:</strong> date, origin, destination, size, qty, customer, status</li>
          <li><strong>KPI sheet:</strong> utilization, storageCost, dwellTime, approvalRate</li>
          <li>📝 Sheet names can be: inventory, booking, kpi (or Vietnamese equivalents)</li>
          <li>🔄 Data will replace existing records for testing suggestions</li>
        </ul>
      </div>
    </div>
  );
};

export default ExcelUpload;