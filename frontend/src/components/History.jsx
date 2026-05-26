import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { 
  Download, FileText, AlertCircle, Clock, CheckCircle, Loader2,
  Search, Filter, Eye, ChevronLeft, ChevronRight, X, FileCheck,
  Globe, ArrowRight, BarChart3, Trash2, XCircle
} from 'lucide-react';

const LANGUAGE_NAMES = {
  "auto": "Auto-detect", "eng": "English", "ben": "Bengali", "hin": "Hindi",
  "guj": "Gujarati", "tam": "Tamil", "tel": "Telugu", "mar": "Marathi",
  "urd": "Urdu", "spa": "Spanish", "fra": "French", "deu": "German",
  "ara": "Arabic", "zho": "Chinese", "jpn": "Japanese", "kor": "Korean",
  "rus": "Russian", "por": "Portuguese", "ita": "Italian", "nld": "Dutch",
  "tur": "Turkish", "vie": "Vietnamese", "tha": "Thai", "pol": "Polish",
  "ukr": "Ukrainian", "unknown": "Unknown",
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Pending' },
  processing: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Processing' },
  completed: { icon: FileCheck, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', label: 'Failed' },
};

const ProgressBar = ({ current, total }) => {
  if (!total || total <= 0) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="w-full mt-2">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Progress</span>
        <span>{current} / {total} pages ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const PDFPreviewModal = ({ doc, onClose }) => {
  const { getAuthUrl } = useAuth();
  if (!doc) return null;
  
  const downloadUrl = getAuthUrl(`/api/documents/${doc.id}/download`);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-slate-800">{doc.original_filename}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>{doc.page_count ? `${doc.page_count} pages` : 'Unknown pages'}</span>
                <span>·</span>
                <span>{format(new Date(doc.upload_date), 'MMM d, yyyy')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" /> Download
            </a>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-gray-100">
          {doc.status === 'completed' ? (
            <iframe src={`${downloadUrl}#toolbar=1&navpanes=0`} className="w-full h-full min-h-[500px]" title="PDF Preview" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-gray-500">
              {doc.status === 'processing' || doc.status === 'pending' ? (
                <>
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
                  <p className="text-lg font-medium">Translation in progress...</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                  <p className="text-lg font-medium">Translation failed</p>
                  <p className="text-sm mt-1 text-red-600 max-w-md text-center">{doc.error_message}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const History = () => {
  const { getAuthUrl } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchDocs = async () => {
    try {
      const res = await axios.get('/api/documents/');
      setDocuments(res.data);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDocs();
    const interval = setInterval(fetchDocs, 10000); // 10s polling
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this document?")) return;
    try {
      await axios.delete(`/api/documents/${id}`);
      setDocuments(docs => docs.filter(d => d.id !== id));
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) { alert("Failed to delete document."); }
  };

  const handleCancel = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Cancel this translation?")) return;
    try {
      await axios.post(`/api/documents/${id}/cancel`);
      fetchDocs();
    } catch (err) { alert("Failed to cancel."); }
  };

  const filteredDocs = documents.filter((doc) => {
    return (doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase())) && 
           (statusFilter === 'all' || doc.status === statusFilter);
  });

  const totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
  const paginatedDocs = filteredDocs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleDownload = (id, e) => {
    e.stopPropagation();
    window.open(getAuthUrl(`/api/documents/${id}/download`), '_blank');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Translation History</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg outline-none text-sm w-64" />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg outline-none text-sm bg-white">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedDocs.map((doc) => {
          const status = statusConfig[doc.status];
          const StatusIcon = status.icon;
          
          return (
            <div key={doc.id} onClick={() => setSelectedDoc(doc)} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-lg ${status.bg}`}>
                  <StatusIcon className={`w-5 h-5 ${status.color} ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.color} ${status.border}`}>
                    {status.label}
                  </span>
                  <button onClick={(e) => handleDelete(doc.id, e)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 truncate mb-1">{doc.original_filename}</h3>
              
              {doc.status === 'processing' && doc.page_count && doc.processed_pages !== undefined && (
                <ProgressBar current={doc.processed_pages} total={doc.page_count} />
              )}
              
              <div className="flex items-center gap-2 mt-4">
                <button onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-gray-50 hover:bg-gray-100 rounded-lg">
                  <Eye className="w-4 h-4" /> Preview
                </button>
                {doc.status === 'completed' && (
                  <button onClick={(e) => handleDownload(doc.id, e)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">
                    <Download className="w-4 h-4" /> Download
                  </button>
                )}
                {(doc.status === 'pending' || doc.status === 'processing') && (
                  <button onClick={(e) => handleCancel(doc.id, e)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg">
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Pagination Logic ... */}
      
      {selectedDoc && <PDFPreviewModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}
    </div>
  );
};

export default History;