import React, { useState, useRef } from 'react';

const Upload = ({ size, className }) => (
  <svg className={className} width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const Camera = ({ size, className }) => (
  <svg className={className} width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const X = ({ size, className }) => (
  <svg className={className} width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckCircle = ({ size, className }) => (
  <svg className={className} width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function ReceiptUpload({ txId, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/transactions/${txId}/receipt`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      setResult(data.items);
      if (onUploadSuccess) onUploadSuccess();
    } catch (error) {
      console.error(error);
      alert('Failed to analyze receipt. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const getSubcategoryColor = (sub) => {
    switch (sub?.toLowerCase()) {
      case 'essential': return 'bg-green-900/50 text-green-400 border-green-800';
      case 'standard': return 'bg-blue-900/50 text-blue-400 border-blue-800';
      case 'luxury': return 'bg-purple-900/50 text-purple-400 border-purple-800';
      default: return 'bg-gray-800 text-gray-400 border-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1C1C1E] rounded-2xl w-full max-w-md border border-[#2C2C2E] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-[#2C2C2E]">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <span className="text-blue-500">🧾</span>
            Scan Receipt
          </h2>
          <button onClick={onClose} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {!result ? (
            <div className="flex flex-col gap-4">
              {!preview ? (
                <div
                  className="border-2 border-dashed border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-500 transition-colors bg-black/20"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-blue-400">
                    <Camera size={32} />
                  </div>
                  <p className="text-gray-300 font-medium text-center">
                    Tap to take a photo<br />
                    <span className="text-sm text-gray-500">or choose from gallery</span>
                  </p>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-[#2C2C2E] bg-black">
                  <img src={preview} alt="Receipt preview" className="w-full h-48 object-contain" />
                  <button
                    onClick={() => { setFile(null); setPreview(null); }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white backdrop-blur-md"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
              />

              <button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  !file
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : isUploading
                    ? 'bg-blue-600/50 text-blue-200'
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 hover:bg-blue-500'
                }`}
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing with AI...
                  </>
                ) : (
                  <>
                    <Upload size={20} /> Analyze Receipt
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 bg-green-900/30 p-3 rounded-xl border border-green-800/50">
                <CheckCircle size={24} className="text-green-500 shrink-0" />
                <p className="text-sm text-green-100">Receipt analyzed! Here's your itemized breakdown.</p>
              </div>

              <div className="flex flex-col gap-2">
                {result.map((item, idx) => (
                  <div key={idx} className="bg-black/40 border border-[#2C2C2E] rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-medium text-sm pr-2 leading-tight">{item.name}</p>
                      <p className="text-white font-bold text-sm shrink-0">€{item.amount?.toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2 items-center mt-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">{item.category}</span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getSubcategoryColor(item.subcategory)}`}>
                        {item.subcategory}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-bold bg-gray-800 text-white hover:bg-gray-700 transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
