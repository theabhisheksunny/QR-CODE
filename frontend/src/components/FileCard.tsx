import { useState, useEffect, useRef } from 'react';
import { Copy, Trash2, Check, Clock, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { FileUploadResponse } from '../types';
import { QrDisplay } from './QrDisplay';
import { formatFileSize, formatCountdown, isExpired } from '../utils/format';
import { deleteFile } from '../api/files';
import { copyText } from '../utils/clipboard';
import { shareDownloadUrl, triggerDownload } from '../services/download';

interface FileCardProps {
  file: FileUploadResponse;
  onDeleted?: () => void;
}

export const FileCard = ({ file, onDeleted }: FileCardProps) => {
  const [countdown, setCountdown] = useState(formatCountdown(file.expiresAt));
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(file.expiresAt));
    }, 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(copyTimerRef.current);
    };
  }, [file.expiresAt]);

  const handleCopyLink = async () => {
    const ok = await copyText(file.shareUrl);
    if (ok) {
      setCopied(true);
      toast.success('Link copied!');
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Unable to copy');
    }
  };

  // Token for the dedicated download endpoint (same extraction SharePage uses).
  const fileToken = file.shareUrl?.split('/share/')[1] ?? file.id;

  const handleDownload = async () => {
    const res = await triggerDownload(shareDownloadUrl(fileToken), file.originalFileName);
    if (res.ok) toast.success(res.path ? `Saved to ${res.path}` : 'Saved successfully');
    else toast.error('Download failed');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFile(file.id);
      toast.success('File deleted');
      onDeleted?.();
    } catch {
      toast.error('Failed to delete file');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const expired = isExpired(file.expiresAt);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white truncate max-w-xs">{file.originalFileName}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {formatFileSize(file.fileSize)} • {file.contentType}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full ${
          expired
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
        }`}>
          <Clock className="w-3.5 h-3.5" />
          {expired ? 'Expired' : countdown}
        </div>
      </div>
      <QrDisplay qrCode={file.qrCode} value={file.shareUrl} label="SHARE URL" filename={file.originalFileName} copyLabel="Copy Link" />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          Copy Link
        </button>
        <button
          onClick={handleDownload}
          disabled={expired}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete File
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 dark:text-red-400">Delete this file?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-2.5 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg"
            >
              {deleting ? 'Deleting…' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="px-2.5 py-2 text-sm font-medium bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {file.downloadCount > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Downloaded {file.downloadCount} time{file.downloadCount !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
};
