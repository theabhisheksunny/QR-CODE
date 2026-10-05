import { useEffect, useRef, useState } from 'react';
import { formatFileSize } from '../utils/format';

interface UploadProgressProps {
  progress: number;
  loaded?: number;
  total?: number;
  onCancel?: () => void;
}

export const UploadProgress = ({ progress, loaded = 0, total = 0, onCancel }: UploadProgressProps) => {
  // Estimate remaining time from a short moving sample of real progress.
  const startRef = useRef<number>(Date.now());
  const [eta, setEta] = useState<string>('');

  useEffect(() => {
    if (loaded <= 0 || total <= 0) return;
    const elapsedSec = (Date.now() - startRef.current) / 1000;
    if (elapsedSec < 1) return;
    const rate = loaded / elapsedSec; // bytes/sec
    if (rate <= 0) return;
    const remainingSec = Math.max(0, (total - loaded) / rate);
    if (remainingSec < 1) {
      setEta('finishing…');
    } else if (remainingSec < 60) {
      setEta(`~${Math.ceil(remainingSec)}s remaining`);
    } else {
      const m = Math.floor(remainingSec / 60);
      const s = Math.ceil(remainingSec % 60);
      setEta(`~${m}m ${s}s remaining`);
    }
  }, [loaded, total]);

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
        <span>Uploading…</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {total > 0 ? `${formatFileSize(loaded)} / ${formatFileSize(total)}` : ''}
          {eta ? ` · ${eta}` : ''}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-red-600 dark:text-red-400 hover:underline font-medium"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
