import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Download, RefreshCw } from 'lucide-react';
// Legacy build maximizes compatibility with the JavaFX WebKit WebView and
// older Android System WebViews (the default v4/modern build emits newer JS
// that those embedded engines may not support).
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
// Vite bundles the worker as a hashed asset and returns its (same-origin) URL.
// This works in a normal browser, the JavaFX WebView, and the Android WebView,
// because all three load it over the local HTTP origin — not via a CDN or a
// browser-only blob assumption.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

interface PdfViewerProps {
  /** HTTP(S) URL of the PDF (existing tokenized share/room file URL). PDF.js
   *  fetches it over HTTP so Range/streaming is preserved — no base64 blob. */
  url: string;
  fileName: string;
  /** Optional download handler (uses the app's existing download flow). */
  onDownload?: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export const PdfViewer = ({ url, fileName, onDownload }: PdfViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [reloadKey, setReloadKey] = useState(0);
  // Hold the loaded document so zoom re-renders don't re-fetch the PDF.
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // --- Load the document (runs on url change or explicit retry) ---
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setNumPages(0);
    docRef.current = null;

    // getDocument({ url }) streams over HTTP and uses Range requests when the
    // server advertises Accept-Ranges (our FileStreamer does). The whole file
    // is NOT loaded into one giant JS string.
    const task = pdfjsLib.getDocument({ url, withCredentials: false });
    task.promise
      .then((doc) => {
        if (cancelled) { doc.destroy(); return; }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
      task.destroy?.();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url, reloadKey]);

  // --- Render all pages whenever the doc is ready or the scale changes ---
  const renderPages = useCallback(async () => {
    const doc = docRef.current;
    const container = containerRef.current;
    if (!doc || !container) return;
    container.innerHTML = '';

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      let page;
      try {
        page = await doc.getPage(pageNum);
      } catch {
        continue; // skip a page that fails rather than failing the whole doc
      }
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      // Account for device pixel ratio for crisp rendering, capped to avoid
      // excessive memory on very high-DPI screens.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.className = 'mx-auto mb-3 rounded shadow border border-gray-200 dark:border-slate-700 bg-white';
      ctx.scale(dpr, dpr);
      container.appendChild(canvas);
      try {
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        /* render of a single page failed; leave the (blank) canvas in place */
      }
    }
  }, [scale]);

  useEffect(() => {
    if (state === 'ready') {
      renderPages();
    }
  }, [state, renderPages]);

  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm">Loading PDF…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-gray-500 dark:text-gray-400">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-sm">Unable to render PDF</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- ready ---
  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {numPages} page{numPages !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            className="p-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-40 text-gray-800 dark:text-gray-200 rounded-lg"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            className="p-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-40 text-gray-800 dark:text-gray-200 rounded-lg"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              aria-label="Download PDF"
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
            >
              <Download className="w-4 h-4" /> Download
            </button>
          )}
        </div>
      </div>
      {/* Scrollable page canvas area */}
      <div
        ref={containerRef}
        title={fileName}
        className="w-full max-h-[32rem] overflow-auto rounded-lg bg-gray-100 dark:bg-slate-900 p-3"
      />
    </div>
  );
};
