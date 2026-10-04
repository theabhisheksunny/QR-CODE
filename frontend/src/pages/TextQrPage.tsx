import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QrCode, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { generateTextQr } from '../api/qr';
import { QrDisplay } from '../components/QrDisplay';
import { QrValueResponse } from '../types';
import { useQrHistory } from '../hooks/useQrHistory';

export const TextQrPage = () => {
  const location = useLocation();
  // Optionally pre-filled when navigated from a native QR scan (text/number/JSON).
  const scanned = (location.state as { scanned?: string } | null)?.scanned ?? '';
  const [value, setValue] = useState(scanned);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QrValueResponse | null>(null);
  const { addEntry } = useQrHistory();

  const handleGenerate = async () => {
    if (!value.trim()) { toast.error('Please enter a value'); return; }
    setLoading(true);
    try {
      const res = await generateTextQr(value.trim());
      setResult(res);
      addEntry({ type: 'text', label: value.trim().slice(0, 60), value: res.value, qrCode: res.qrCode });
      toast.success('QR code generated!');
    } catch {
      toast.error('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Text / Value QR</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Enter any text, URL, number, JSON, email, or phone number</p>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'https://example.com, 123456789, {"key": "value"}, hello world...'}
            rows={5}
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <span className="absolute bottom-2 right-3 text-xs text-gray-400">{value.length}</span>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !value.trim()}
          className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          {loading ? 'Generating...' : 'Generate QR'}
        </button>
      </div>
      {result && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
          <QrDisplay qrCode={result.qrCode} value={result.value} label={result.type} filename="text-qr" />
        </div>
      )}
    </div>
  );
};
