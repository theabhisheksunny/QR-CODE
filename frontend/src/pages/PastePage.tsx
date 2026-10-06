import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardPaste, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { resolveQrRoute, QrRoute } from '../services/scanner';
import { establishFromHost } from '../services/apiBase';

/**
 * Paste Link / Value — a first-class receive path that works over plain LAN
 * HTTP without a camera. The user pastes (or the app reads the clipboard) a
 * copied share/room link, optionally edits it, and opens it. Validation and
 * routing use the SAME shared resolveQrRoute() — only /share/<token> and
 * /room/<token> are accepted; anything else is rejected (never a generic URL
 * launcher).
 */
export const PastePage = () => {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<QrRoute | null>(null);

  const resolve = (raw: string): QrRoute | null => (raw.trim() ? resolveQrRoute(raw) : null);

  const onChange = (v: string) => {
    setValue(v);
    setPreview(resolve(v));
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) { onChange(text); return; }
      }
      toast('Paste into the box with Ctrl+V, then Open');
    } catch {
      // readText often blocked on non-secure origins — guide manual paste.
      toast('Paste into the box with Ctrl+V, then Open');
    }
  };

  const handleOpen = () => {
    const route = resolve(value);
    if (!route || route.kind === 'unsupported') {
      toast.error('Unsupported QR/link');
      return;
    }
    if (route.host) establishFromHost(route.host);
    if (route.kind === 'direct-share') {
      toast.success('Opening shared file');
      navigate(`/share/${route.token}`);
    } else {
      toast.success('Opening room');
      navigate(`/room/${route.token}`);
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardPaste className="w-6 h-6 text-amber-500" /> Paste Link / Value
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Paste a copied share or room link and open it — no camera needed. Works over local Wi-Fi.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
        <div className="flex gap-2">
          <button
            onClick={handlePasteFromClipboard}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg"
          >
            <ClipboardPaste className="w-4 h-4" /> Paste from Clipboard
          </button>
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="http://192.168.x.x:8787/share/… or /room/…"
          rows={3}
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white break-all"
        />

        {preview && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            preview.kind === 'unsupported'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
          }`}>
            {preview.kind === 'unsupported'
              ? (<><AlertCircle className="w-4 h-4" /> Unsupported QR/link</>)
              : (<><CheckCircle2 className="w-4 h-4" /> {preview.kind === 'room' ? 'Local Room' : 'Shared File'} detected</>)}
          </div>
        )}

        <button
          onClick={handleOpen}
          disabled={!preview || preview.kind === 'unsupported'}
          className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl"
        >
          Open <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
