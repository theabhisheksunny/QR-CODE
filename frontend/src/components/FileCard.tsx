import { useState, useEffect } from 'react';
import { Copy, Trash2, Check, Clock, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { FileUploadResponse } from '../types';
import { QrDisplay } from './QrDisplay';
import { formatFileSize, formatCountdown, isExpired } from '../utils/format';
import { deleteFile } from '../api/files';

interface FileCardProps {
  file: FileUploadResponse;
  onDeleted?: () => void;
}

export const FileCard = ({ file, onDeleted }: FileCardProps) => {
  const [countdown, setCountdown] = useState(formatCountdown(file.expiresAt));
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(file.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [file.expiresAt]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(file.shareUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this file?')) return;
    setDeleting(true);
    try {
      await deleteFile(file.id);
      toast.success('File deleted');
      onDeleted?.();
    } catch {
      toast.error('Failed to delete file');
      setDeleting(false);
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
      <QrDisplay qrCode={file.qrCode} value={file.shareUrl} label="SHARE URL" filename={file.originalFileName} />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          Copy Link
        </button>
        <a
          href={`/api/files/share/${file.shareUrl?.split('/share/')[1] ?? file.id}`}
          download={file.originalFileName}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Delete File
        </button>
      </div>
      {file.downloadCount > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Downloaded {file.downloadCount} time{file.downloadCount !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
};
