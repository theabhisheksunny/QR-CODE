import { Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface QrDisplayProps {
  qrCode: string;
  value?: string;
  label?: string;
  filename?: string;
}

export const QrDisplay = ({ qrCode, value, label, filename = 'qr-code' }: QrDisplayProps) => {
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = qrCode;
    a.download = `${filename}.png`;
    a.click();
    toast.success('QR code downloaded');
  };

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
          {label}
        </span>
      )}
      <div className="p-3 bg-white rounded-xl shadow-md border border-gray-100 dark:border-slate-700">
        <img src={qrCode} alt="QR Code" className="w-48 h-48 sm:w-56 sm:h-56" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Download QR
        </button>
        {value && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Value'}
          </button>
        )}
      </div>
    </div>
  );
};
