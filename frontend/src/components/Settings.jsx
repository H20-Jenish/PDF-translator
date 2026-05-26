import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, Server, Bot, Loader2, CheckCircle, RefreshCw, Lock, Eye, EyeOff } from 'lucide-react';

const Settings = () => {
  const [form, setForm] = useState({
    ai_server_url: '',
    ai_model_name: '',
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    axios.get('/api/settings/').then((res) => {
      setForm({
        ai_server_url: res.data.ai_server_url || '',
        ai_model_name: res.data.ai_model_name || '',
      });
      setLoading(false);
    });
  }, []);

  const fetchOllamaModels = async () => {
    setFetchingModels(true);
    try {
      const res = await axios.get('/api/models/ollama');
      setAvailableModels(res.data.models || []);
    } catch (err) {
      alert('Failed to fetch models from Ollama. Is the server running?');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await axios.put('/api/settings/', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSaved(false);
    
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.new_password.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    
    setPwSaving(true);
    try {
      await axios.post('/api/auth/change-password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwSaved(true);
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-6">AI Server Settings</h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600" />
                Server URL
              </label>
              <input
                type="url"
                value={form.ai_server_url}
                onChange={(e) => setForm({ ...form, ai_server_url: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="http://ollama:11434"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use <code className="bg-gray-100 px-1 rounded">http://host.docker.internal:11434</code> for host Ollama
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-600" />
                  Model Name
                </label>
                <button
                  type="button"
                  onClick={fetchOllamaModels}
                  disabled={fetchingModels}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                  {fetchingModels ? 'Fetching...' : 'Fetch from Ollama'}
                </button>
              </div>
              
              {availableModels.length > 0 ? (
                <select
                  value={form.ai_model_name}
                  onChange={(e) => setForm({ ...form, ai_model_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.ai_model_name}
                  onChange={(e) => setForm({ ...form, ai_model_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="translategemma:12b"
                />
              )}
              
              {availableModels.length > 0 && (
                <p className="text-xs text-emerald-600 mt-1">
                  {availableModels.length} model(s) found on Ollama
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <Save className="w-4 h-4" />
                Save Settings
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Saved successfully
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Security</h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-800">Change Password</h3>
          </div>
          
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={pwForm.confirm_password}
                onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="Confirm new password"
              />
            </div>
            
            {pwError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {pwError}
              </div>
            )}
            
            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={pwSaving}
                className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                <Lock className="w-4 h-4" />
                Update Password
              </button>
              {pwSaved && (
                <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Password updated
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Connection Tips</h3>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Click <strong>Fetch from Ollama</strong> to auto-populate available models.</li>
          <li>Make sure Ollama is running and <code className="bg-blue-100 px-1 rounded">translategemma:12b</code> is pulled.</li>
          <li>No API key is required for local Ollama.</li>
        </ul>
      </div>
    </div>
  );
};

export default Settings;