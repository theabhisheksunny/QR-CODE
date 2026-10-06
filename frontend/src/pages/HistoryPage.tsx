import { useState } from 'react';
import { QrCode, Trash2, Clock, ExternalLink } from 'lucide-react';
import { useQrHistory } from '../hooks/useQrHistory';
import { formatCountdown, isExpired } from '../utils/format';

export const HistoryPage = () => {
  const { history, removeEntry, clearHistory } = useQrHistory();
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">History</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{history.length} item{history.length !== 1 ? 's' : ''}</p>
        </div>
        {history.length > 0 && !confirmingClear && (
          <button
            onClick={() => setConfirmingClear(true)}
            className="text-sm text-red-500 hover:text-red-600 font-medium"
          >
            Clear All
          </button>
        )}
        {confirmingClear && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 dark:text-red-400">Clear all history?</span>
            <button
              onClick={() => { clearHistory(); setConfirmingClear(false); }}
              className="px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmingClear(false)}
              className="px-2.5 py-1 text-xs font-medium bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {history.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <QrCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No history yet. Generate some QR codes!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map((entry) => (
            <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 flex items-center gap-4">
              <img src={entry.qrCode} alt="QR" className="w-16 h-16 rounded-lg flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{entry.label}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    entry.type === 'text'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  }`}>{entry.type === 'text' ? 'Text' : 'File'}</span>
                  {entry.expiresAt && (
                    <span className={`text-xs flex items-center gap-0.5 ${
                      isExpired(entry.expiresAt) ? 'text-red-400' : 'text-green-500'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {isExpired(entry.expiresAt) ? 'Expired' : formatCountdown(entry.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {entry.shareUrl && (
                  <a
                    href={entry.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => removeEntry(entry.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
