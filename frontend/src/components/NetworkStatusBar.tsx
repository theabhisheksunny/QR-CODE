import { useState, useEffect } from 'react';
import { Wifi, Copy, Check } from 'lucide-react';
import { getNetworkInfo } from '../api/network';
import { NetworkInfo } from '../types';

export const NetworkStatusBar = () => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getNetworkInfo()
      .then(setNetworkInfo)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!networkInfo) return;
    try {
      await navigator.clipboard.writeText(networkInfo.shareBaseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available, silently ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 w-full max-w-2xl mx-auto">
        <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-3 w-48 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
    );
  }

  if (error || !networkInfo) {
    return null;
  }

  const isLan = networkInfo.localIp !== '127.0.0.1';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border w-full max-w-2xl mx-auto transition-colors ${
        isLan
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      }`}
    >
      <Wifi
        className={`w-4 h-4 flex-shrink-0 ${
          isLan ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
        }`}
      />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
          {isLan ? 'Sharing on LAN:' : 'LAN not detected —'}
        </span>
        <code
          className={`text-sm font-mono font-medium ${
            isLan
              ? 'text-green-700 dark:text-green-300'
              : 'text-yellow-700 dark:text-yellow-300'
          }`}
        >
          {networkInfo.shareBaseUrl}
        </code>
        {!isLan && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-2">
            (loopback only — connect to Wi-Fi or LAN)
          </span>
        )}
      </div>
      <button
        onClick={handleCopy}
        title="Copy share base URL"
        aria-label="Copy share base URL to clipboard"
        className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
          isLan
            ? 'hover:bg-green-100 dark:hover:bg-green-800/40 text-green-600 dark:text-green-400'
            : 'hover:bg-yellow-100 dark:hover:bg-yellow-800/40 text-yellow-600 dark:text-yellow-400'
        }`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
};
