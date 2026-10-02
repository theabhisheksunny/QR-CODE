import { useState, useEffect } from 'react';
import { Save, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';

export const SettingsPage = () => {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setApiBaseUrl(localStorage.getItem('qrshare_api_base_url') ?? '');
    setDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const handleSave = () => {
    if (apiBaseUrl) {
      localStorage.setItem('qrshare_api_base_url', apiBaseUrl);
    } else {
      localStorage.removeItem('qrshare_api_base_url');
    }
    toast.success('Settings saved');
  };

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('qrshare_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('qrshare_theme', 'light');
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Configure the application</p>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-5">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Appearance</h2>
          <button
            onClick={toggleDark}
            className="flex items-center gap-3 w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
            <span className="font-medium text-gray-800 dark:text-gray-200">{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
        </div>
        <hr className="border-gray-100 dark:border-slate-700" />
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">API Base URL</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Leave blank to use the default (Vite proxy in dev, same origin in production)</p>
          <input
            type="url"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="http://localhost:8080"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={handleSave}
          className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
        >
          <Save className="w-4 h-4" />
          Save Settings
        </button>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">About</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Universal QR Code Generator &amp; File Sharing — a full-stack application for generating QR codes from any text/value and sharing files between devices using temporary secure links.</p>
      </div>
    </div>
  );
};
