import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMimeCategory } from '../utils/format';
import { sharePreviewUrl, triggerDownload } from '../services/download';
import { PdfViewer } from './PdfViewer';

/**
 * Inline file viewer reused by BOTH Quick Share and Local Sharing Rooms.
 *
 * Provide EITHER:
 *   - `token`  → builds the Quick Share inline URL (`/api/files/share/{token}`), or
 *   - `src`    → an already-built inline URL (e.g. a room file preview URL
 *                `/api/rooms/{roomToken}/files/{fileToken}`).
 *
 * The viewer logic (image/video/audio/pdf/text) lives here ONCE; room cards
 * simply pass the room preview URL as `src`. The backend base GET endpoint
 * streams inline (content-type-aware Content-Disposition) with Range support,
 * so large media stream and seek correctly.
 *
 * PDF is rendered by the shared PDF.js-based {@link PdfViewer}, which works
 * inside a normal browser AND the embedded JavaFX / Android WebViews (none of
 * which can render a raw PDF via an <iframe> reliably). image/video/audio/text
 * continue to use native HTML elements that render in every WebView.
 */
interface FilePreviewProps {
  contentType: string;
  fileName: string;
  /** Quick Share access token (mutually exclusive with `src`). */
  token?: string;
  /** Pre-built inline URL (mutually exclusive with `token`). */
  src?: string;
}

export const FilePreview = ({ token, src, contentType, fileName }: FilePreviewProps) => {
  const category = getMimeCategory(contentType);
  const fileUrl = src ?? (token ? sharePreviewUrl(token) : '');
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (category === 'text' && fileUrl) {
      fetch(fileUrl)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent('Could not load text content'));
    }
  }, [fileUrl, category]);

  if (!fileUrl) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-gray-500 dark:text-gray-400">
        <FileText className="w-12 h-12" />
        <p className="text-sm">Preview unavailable</p>
      </div>
    );
  }

  if (category === 'image') {
    return <img src={fileUrl} alt={fileName} className="max-w-full max-h-96 rounded-lg shadow-md mx-auto" />;
  }
  if (category === 'video') {
    return <video src={fileUrl} controls className="max-w-full rounded-lg shadow-md mx-auto" />;
  }
  if (category === 'audio') {
    return <audio src={fileUrl} controls className="w-full" />;
  }
  if (category === 'pdf') {
    // Embedded PDF.js renderer — works on web, Windows WebView, Android WebView.
    // Downloads reuse the app's existing platform-aware download flow.
    return (
      <PdfViewer
        url={fileUrl}
        fileName={fileName}
        onDownload={async () => {
          const res = await triggerDownload(fileUrl, fileName);
          if (res.ok) toast.success(res.path ? `Saved to ${res.path}` : 'Saved successfully');
          else toast.error('Download failed');
        }}
      />
    );
  }
  if (category === 'text' && textContent !== null) {
    return (
      <pre className="w-full max-h-64 overflow-auto p-4 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {textContent}
      </pre>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-gray-500 dark:text-gray-400">
      <FileText className="w-12 h-12" />
      <p className="text-sm">Preview unavailable for this file type</p>
    </div>
  );
};
