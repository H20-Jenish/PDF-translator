import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { 
  Download, FileText, AlertCircle, Clock, CheckCircle, Loader2,
  Database, Layers, Brain, Cpu, Server, Activity, ArrowRight,
  TrendingUp, FileCheck, Clock3, Globe, ArrowRightLeft, XCircle
} from 'lucide-react';

const statusConfig = {
  healthy: { color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', pulse: 'animate-pulse' },
  unhealthy: { color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', pulse: '' },
  offline: { color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', pulse: '' },
};

const serviceIcons = { database: Database, cache: Layers, ai: Brain, worker: Cpu, api: Server };

const docStatusIcons = {
  pending: <Clock className="w-5 h-5 text-amber-500" />,
  processing: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  failed: <AlertCircle className="w-5 h-5 text-red-500" />,
};

const docStatusClasses = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

const LANGUAGE_NAMES = {
  "auto": "Auto", "eng": "EN", "ben": "BN", "hin": "HI", "guj": "GU",
  "tam": "TA", "tel": "TE", "mar": "MR", "urd": "UR", "spa": "ES",
  "fra": "FR", "deu": "DE", "ara": "AR", "zho": "ZH", "jpn": "JA",
  "kor": "KO", "rus": "RU", "por": "PT", "ita": "IT", "nld": "NL",
  "tur": "TR", "vie": "VI", "tha": "TH", "pol": "PL", "ukr": "UK",
  "unknown": "Unknown",
};

const ServiceCard = ({ service }) => {
  const Icon = serviceIcons[service.type] || Server;
  const status = service.status === 'healthy' ? 'healthy' : 
                 service.status.startsWith('unhealthy') ? 'unhealthy' : 'offline';
  const cfg = statusConfig[status];
  
  return (
    <div className={`relative overflow-hidden rounded-xl border ${cfg.border} ${cfg.bg} p-4 transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-white/80 ${cfg.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800">{service.name}</h3>
            <p className="text-xs text-slate-500 capitalize">{service.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse}`} />
          <span className={`text-xs font-medium ${cfg.color}`}>
            {status === 'healthy' ? 'Online' : status === 'unhealthy' ? 'Warning' : 'Offline'}
          </span>
        </div>
      </div>
      {service.message && <p className="mt-2 text-xs text-slate-600 truncate">{service.message}</p>}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
    <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
      <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  </div>
);

const Dashboard = () => {
  const { getAuthUrl } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);

  const fetchDocs = async () => {
    try {
      const res = await axios.get('/api/documents/');
      setDocuments(res.data);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const fetchServices = async () => {
    try {
      const res = await axios.get('/api/health/services');
      setServices(res.data.services || []);
    } catch (err) { console.error(err); } 
    finally { setServicesLoading(false); }
  };

  useEffect(() => {
    fetchDocs();
    fetchServices();
    const interval = setInterval(() => {
      fetchDocs();
      fetchServices();
    }, 10000); // 10s poll rate reduces log noise
    return () => clearInterval(interval);
  }, []);

  const handleCancel = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Cancel this translation task?")) return;
    try {
      await axios.post(`/api/documents/${id}/cancel`);
      fetchDocs();
    } catch (err) {
      alert("Failed to cancel document.");
    }
  };

  const handleDownload = (id) => {
    const url = getAuthUrl(`/api/documents/${id}/download`);
    window.open(url, '_blank');
  };

  const stats = {
    total: documents.length,
    completed: documents.filter(d => d.status === 'completed').length,
    processing: documents.filter(d => d.status === 'processing' || d.status === 'pending').length,
    failed: documents.filter(d => d.status === 'failed').length,
  };

  const recentDocs = documents.slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-slate-500 mt-1">Overview of your translation pipeline</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span>Live updates every 10s</span>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-slate-800">Service Health</h3>
        </div>
        {servicesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {services.map((service, idx) => <ServiceCard key={idx} service={service} />)}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-slate-800">Statistics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={FileText} label="Total Documents" value={stats.total} color="bg-blue-500" />
          <StatCard icon={FileCheck} label="Completed" value={stats.completed} color="bg-emerald-500" />
          <StatCard icon={Clock3} label="In Progress" value={stats.processing} color="bg-amber-500" />
          <StatCard icon={AlertCircle} label="Failed" value={stats.failed} color="bg-red-500" />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-800">Recent Documents</h3>
          </div>
          <a href="/history" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
            View All <ArrowRight className="w-4 h-4" />
          </a>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : recentDocs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No documents yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Filename</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Languages</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Progress</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Uploaded</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-400" />
                          <span className="font-medium text-slate-700 truncate max-w-xs">{doc.original_filename}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {doc.source_language && doc.target_language ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-slate-600">
                              {LANGUAGE_NAMES[doc.source_language] || doc.source_language}
                            </span>
                            <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                            <span className="px-1.5 py-0.5 bg-emerald-50 rounded text-emerald-700 font-medium">
                              {LANGUAGE_NAMES[doc.target_language] || doc.target_language}
                            </span>
                          </div>
                        ) : (<span className="text-xs text-gray-400">-</span>)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${docStatusClasses[doc.status]}`}>
                          {docStatusIcons[doc.status]}
                          {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {doc.status === 'processing' && doc.page_count ? (
                          <div className="w-32">
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                              <span>{doc.processed_pages || 0}/{doc.page_count}</span>
                              <span>{Math.round(((doc.processed_pages || 0) / doc.page_count) * 100)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, ((doc.processed_pages || 0) / doc.page_count) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (<span className="text-xs text-gray-400">-</span>)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {format(new Date(doc.upload_date), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        {doc.status === 'completed' && (
                          <button onClick={() => handleDownload(doc.id)} className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-medium text-sm">
                            <Download className="w-4 h-4" /> Download
                          </button>
                        )}
                        {(doc.status === 'pending' || doc.status === 'processing') && (
                          <button onClick={(e) => handleCancel(doc.id, e)} className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-700 font-medium text-sm">
                            <XCircle className="w-4 h-4" /> Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;