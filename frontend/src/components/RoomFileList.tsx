import { useState } from 'react';
import { Download, Eye, FileText, Film, Image as ImageIcon, Archive, File as FileIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { RoomFile } from '../types';
import { formatFileSize, getMimeCategory } from '../utils/format';
import { roomFileDownloadUrl, roomFilePreviewUrl, triggerDownload } from '../services/download';
import { FilePreview } from './FilePreview';

/** True for MIME types the app can render inline (image/video/audio/pdf/text). */
const isPreviewable = (contentType: string): boolean => {
  const t = (contentType || '').toLowerCase();
  return t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/')
    || t === 'application/pdf' || t.startsWith('text/');
};

const iconFor = (contentType: string) => {
  switch (getMimeCategory(contentType || '')) {
    case 'video': return <Film className="w-6 h-6 text-rose-500" />;
    case 'image': return <ImageIcon className="w-6 h-6 text-emerald-500" />;
    case 'pdf': return <FileText className="w-6 h-6 text-red-500" />;
    case 'text': return <FileText className="w-6 h-6 text-sky-500" />;
    default:
      return (contentType || '').includes('zip') || (contentType || '').includes('compressed')
        ? <Archive className="w-6 h-6 text-amber-500" />
        : <FileIcon className="w-6 h-6 text-gray-400" />;
  }
};

interface RoomFileCardProps {
  roomToken: string;
  file: RoomFile;
}

export const RoomFileCard = ({ roomToken, file }: RoomFileCardProps) => {
  const downloadUrl = roomFileDownloadUrl(roomToken, file.fileToken);
  const previewUrl = roomFilePreviewUrl(roomToken, file.fileToken);
  const previewable = isPreviewable(file.contentType);
  const [showPreview, setShowPreview] = useState(false);
  const [dlMsg, setDlMsg] = useState<string | null>(null);

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header row: icon + name + buttons */}
      <div className="flex items-center gap-3 p-4">
        <div className="shrink-0">{iconFor(file.contentType)}</div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 dark:text-white truncate" title={file.originalFileName}>
            {file.originalFileName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatFileSize(file.fileSize)} · shared by {file.ownerDisplayName}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {previewable && (
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? 'Hide' : 'Preview'}
            </button>
          )}
          <button
            onClick={async () => {
              setDlMsg(null);
              const r = await triggerDownload(downloadUrl, file.originalFileName);
              if (r.ok) {
                setDlMsg(r.path ? `Saved to ${r.path}` : 'Saved successfully');
                toast.success('Saved successfully');
              } else {
                setDlMsg('Download failed');
                toast.error('Download failed');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </div>
      {/* Download status */}
      {dlMsg && (
        <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-2">
          <p className="text-xs text-gray-600 dark:text-gray-300 break-all">{dlMsg}</p>
        </div>
      )}
      {/* Expandable preview */}
      {showPreview && previewable && (
        <div className="border-t border-gray-100 dark:border-slate-700 p-4">
          <FilePreview src={previewUrl} contentType={file.contentType} fileName={file.originalFileName} />
        </div>
      )}
    </div>
  );
};

interface RoomFileListProps {
  roomToken: string;
  files: RoomFile[];
}

export const RoomFileList = ({ roomToken, files }: RoomFileListProps) => {
  if (files.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
        No files shared yet. Upload one to share it with everyone in the room.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {files.map((f) => (
        <RoomFileCard key={f.fileToken} roomToken={roomToken} file={f} />
      ))}
    </div>
  );
};
