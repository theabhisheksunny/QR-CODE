import { useState, useEffect, Suspense, lazy } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMimeCategory } from '../utils/format';
import { sharePreviewUrl, triggerDownload } from '../services/download';

// LAZY LOAD: PdfViewer (and its pdfjs-dist dependency, ~470 KB) is only fetched
// when a user actually opens a PDF preview. On every other page the main bundle
// is ~458 KB instead of ~924 KB. Vite automatically code-splits the dynamic
// import into a separate chunk + the pdf.worker asset.
const PdfViewer = lazy(() => import('./PdfViewer').then(m => ({ default: m.PdfViewer })));

/**
 * Inline file viewer reused by BOTH Quick Share and Local Sharing Rooms.
 *
 * Provide EITHER:
 *   - `token`  → builds the Quick Share inline URL (`/api/files/share/{token}`), or
 *   - `src`    → an already-built inline URL (e.g. a room file preview URL
 *                `/api/rooms/{roomToken}/files/{fileToken}`).
 *
 * image/video/audio/text use native HTML elements (work in every WebView).
 * PDF uses the lazy-loaded PDF.js canvas renderer (works in every WebView).
 */
interface FilePreviewProps {
  contentType: string;
  fileName: string;
  token?: string;
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
    return (
      <Suspense fallback={
        <div className="flex flex-col items-center gap-3 py-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">Loading PDF viewer…</p>
        </div>
      }>
        <PdfViewer
          url={fileUrl}
          fileName={fileName}
          onDownload={async () => {
            const res = await triggerDownload(fileUrl, fileName);
            if (res.ok) toast.success(res.path ? `Saved to ${res.path}` : 'Saved successfully');
            else toast.error('Download failed');
          }}
        />
      </Suspense>
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
