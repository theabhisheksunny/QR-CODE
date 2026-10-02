import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Download, AlertCircle, Loader2, Clock } from 'lucide-react';
import { getShareMetadata } from '../api/files';
import { FileMetadataResponse } from '../types';
import { FilePreview } from '../components/FilePreview';
import { formatFileSize, formatCountdown, isExpired } from '../utils/format';

export const SharePage = () => {
  const { token } = useParams<{ token: string }>();
  const [metadata, setMetadata] = useState<FileMetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetadata = async () => {
    if (!token) return;
    try {
      const data = await getShareMetadata(token);
      setMetadata(data);
      setCountdown(formatCountdown(data.expiresAt));
    } catch {
      setError('This file is no longer available or has expired.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
    intervalRef.current = setInterval(fetchMetadata, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!metadata) return;
    const timer = setInterval(() => setCountdown(formatCountdown(metadata.expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [metadata]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="max-w-md mx-auto mt-16 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">File No Longer Available</h2>
        <p className="text-gray-500 dark:text-gray-400">{error ?? 'This file has expired or been deleted.'}</p>
      </div>
    );
  }

  const expired = isExpired(metadata.expiresAt);
  const fileToken = metadata.shareUrl.split('/share/')[1];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{metadata.originalFileName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formatFileSize(metadata.fileSize)} • {metadata.contentType}
            </p>
            {metadata.downloadCount > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Downloaded {metadata.downloadCount} time{metadata.downloadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full flex-shrink-0 ${
            expired
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {expired ? 'Expired' : countdown}
          </div>
        </div>
        {!expired && (
          <a
            href={`/api/files/share/${fileToken}`}
            download={metadata.originalFileName}
            className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />
            Download File
          </a>
        )}
      </div>
      {!expired && token && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Preview</h2>
          <FilePreview token={token} contentType={metadata.contentType} fileName={metadata.originalFileName} />
        </div>
      )}
    </div>
  );
};
