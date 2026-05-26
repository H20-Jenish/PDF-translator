import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { 
  UploadCloud, File, X, Loader2, CheckCircle, Globe, 
  Languages, ArrowRight, Sparkles, AlertTriangle
} from 'lucide-react';

const LANGUAGE_NAMES = {
  "auto": "Auto-detect",
  "eng": "English",
  "ben": "Bengali",
  "hin": "Hindi",
  "guj": "Gujarati",
  "tam": "Tamil",
  "tel": "Telugu",
  "mar": "Marathi",
  "urd": "Urdu",
  "spa": "Spanish",
  "fra": "French",
  "deu": "German",
  "ara": "Arabic",
  "zho": "Chinese",
  "jpn": "Japanese",
  "kor": "Korean",
  "rus": "Russian",
  "por": "Portuguese",
  "ita": "Italian",
  "nld": "Dutch",
  "tur": "Turkish",
  "vie": "Vietnamese",
  "tha": "Thai",
  "pol": "Polish",
  "ukr": "Ukrainian",
};

const Upload = () => {
  const [files, setFiles] = useState([]);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('ben');
  const [availableLangs, setAvailableLangs] = useState({});
  const [langLoading, setLangLoading] = useState(true);  // FIXED: was missing
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    axios.get('/api/upload/languages').then((res) => {
      setAvailableLangs(res.data.languages || {});
      setLangLoading(false);
    }).catch(() => setLangLoading(false));
  }, []);

  const onDrop = useCallback((acceptedFiles) => {
    setFiles((prev) => [
      ...prev,
      ...acceptedFiles.map((f) => ({ 
        file: f, 
        id: Math.random().toString(36).slice(2), 
        status: 'pending',
        detectedLang: null,
      })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
  });

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadAll = async () => {
    setUploading(true);
    const newResults = [];
    for (const fileObj of files) {
      if (fileObj.status !== 'pending') continue;
      const formData = new FormData();
      formData.append('file', fileObj.file);
      formData.append('source_language', sourceLang);
      formData.append('target_language', targetLang);
      
      try {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'uploading' } : f))
        );
        const res = await axios.post('/api/upload/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        newResults.push({ 
          name: fileObj.file.name, 
          status: 'success', 
          id: res.data.id,
          detectedLang: res.data.detected_source_language,
        });
        setFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'done', detectedLang: res.data.detected_source_language } : f))
        );
      } catch (err) {
        const msg = err.response?.status === 413 
          ? 'File too large (max 100MB)' 
          : err.response?.data?.detail || err.message;
        newResults.push({ name: fileObj.file.name, status: 'error', error: msg });
        setFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'error' } : f))
        );
      }
    }
    setResults(newResults);
    setUploading(false);
  };

  const langOptions = Object.entries(availableLangs).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload PDFs</h2>
      <p className="text-slate-500 mb-6">Select your translation languages and upload your documents</p>
      
      {/* Language Selection Panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Languages className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Translation Settings</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              Source Language
            </label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              disabled={langLoading}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white text-sm"
            >
              {langOptions.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            {sourceLang === 'auto' && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                We'll auto-detect the language
              </p>
            )}
          </div>
          
          <div className="flex justify-center">
            <div className="p-2 rounded-full bg-gray-100">
              <ArrowRight className="w-5 h-5 text-slate-400" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              Target Language
            </label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              disabled={langLoading}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white text-sm"
            >
              {langOptions.filter(([code]) => code !== 'auto').map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-700">
          {isDragActive ? 'Drop the files here...' : 'Drag & drop PDF files here'}
        </p>
        <p className="text-sm text-gray-500 mt-1">or click to select files</p>
        <p className="text-xs text-gray-400 mt-2">Maximum file size: 100MB</p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <File className="w-5 h-5 text-emerald-600" />
                <div>
                  <span className="text-sm font-medium text-slate-700 block">{f.file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(f.file.size / 1024 / 1024).toFixed(2)} MB)
                    {f.detectedLang && f.detectedLang !== 'unknown' && (
                      <span className="ml-2 text-emerald-600 font-medium">
                        Detected: {LANGUAGE_NAMES[f.detectedLang] || f.detectedLang}
                      </span>
                    )}
                    {f.detectedLang === 'unknown' && f.status === 'done' && (
                      <span className="ml-2 text-amber-600">Language unknown</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                {f.status === 'done' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                {f.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                <button onClick={() => removeFile(f.id)} className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          
          <button
            onClick={uploadAll}
            disabled={uploading || files.every((f) => f.status !== 'pending')}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? 'Uploading...' : `Translate ${files.filter(f => f.status === 'pending').length} File(s)`}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`p-4 rounded-lg border ${
              r.status === 'success' 
                ? 'bg-emerald-50 border-emerald-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {r.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                )}
                <span className={`font-medium ${r.status === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                  {r.name}
                </span>
              </div>
              <p className={`text-sm mt-1 ${r.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                {r.status === 'success' 
                  ? `Queued for translation${r.detectedLang && r.detectedLang !== 'unknown' ? ` (detected: ${LANGUAGE_NAMES[r.detectedLang] || r.detectedLang})` : ''}`
                  : r.error
                }
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Upload;