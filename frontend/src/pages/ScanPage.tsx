import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, CheckCircle2, AlertCircle, ArrowRight, Camera, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRScanner } from '../components/QRScanner';
import { resolveQrRoute, QrRoute, scan as mlkitScan, isScannerSupported } from '../services/scanner';
import { getPlatform } from '../services/platform';
import { establishFromHost } from '../services/apiBase';

/**
 * Scan / Receive page with explicit platform separation (no ambiguous fallback):
 *   - Android/iOS (Capacitor native): ML Kit scanner ONLY.
 *   - Windows desktop (JavaFX WebView): native webcam scanner via the bridge
 *     (QRScanner routes to window.__qrDesktopScan).
 *   - Web browser: getUserMedia + jsQR (QRScanner).
 *
 * All paths funnel their decoded string through the shared resolveQrRoute().
 */
export const ScanPage = () => {
  const navigate = useNavigate();
  const platform = getPlatform();
  const [result, setResult] = useState<QrRoute | null>(null);
  const [nativeState, setNativeState] = useState<'idle' | 'scanning' | 'error'>('idle');
  const [nativeError, setNativeError] = useState('');

  const handleRaw = useCallback((raw: string) => {
    setResult(resolveQrRoute(raw));
  }, []);

  // Native (Android/iOS): drive ML Kit directly — never the web decoder.
  const runNativeScan = useCallback(async () => {
    setNativeState('scanning');
    setNativeError('');
    try {
      const raw = await mlkitScan();
      handleRaw(raw);
      setNativeState('idle');
    } catch (e) {
      setNativeState('error');
      setNativeError(e instanceof Error ? e.message : 'Scanner failed to start');
    }
  }, [handleRaw]);

  // Windows native scanner delivers results via this bridge.
  useEffect(() => {
    (window as unknown as { __qrNativeScanResult?: (raw: string) => void }).__qrNativeScanResult = handleRaw;
    return () => {
      delete (window as unknown as { __qrNativeScanResult?: (raw: string) => void }).__qrNativeScanResult;
    };
  }, [handleRaw]);

  // Auto-start the native ML Kit scanner on mount for Android/iOS.
  useEffect(() => {
    if ((platform === 'android' || platform === 'ios') && isScannerSupported()) {
      runNativeScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openResult = () => {
    if (!result || result.kind === 'unsupported') return;
    if (result.host) establishFromHost(result.host);
    if (result.kind === 'direct-share') {
      toast.success('Opening shared file');
      navigate(`/share/${result.token}`);
    } else {
      toast.success('Opening room');
      navigate(`/room/${result.token}`);
    }
  };

  const renderScanner = () => {
    // Native path (Android/iOS): ML Kit controlled here, no web scanner.
    if (platform === 'android' || platform === 'ios') {
      return (
        <div className="flex flex-col items-center gap-4 py-4">
          {nativeState === 'scanning' ? (
            <><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /><p className="text-sm text-gray-500">Opening camera…</p></>
          ) : nativeState === 'error' ? (
            <>
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{nativeError}</p>
              <button onClick={runNativeScan} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
                <Camera className="w-4 h-4" /> Try Again
              </button>
            </>
          ) : (
            <button onClick={runNativeScan} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
              <Camera className="w-4 h-4" /> Scan with Camera
            </button>
          )}
          <p className="text-xs text-gray-400">Platform: {platform} · ML Kit scanner</p>
        </div>
      );
    }
    // Desktop + Web path.
    return <QRScanner onResult={handleRaw} onCancel={() => navigate('/')} />;
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ScanLine className="w-6 h-6 text-indigo-500" /> Scan QR Code
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Scan a Universal QR Sharing code to receive a file or join a room.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
        {!result ? renderScanner()
          : result.kind === 'unsupported' ? (
            <div className="flex flex-col items-center gap-4 text-center py-4">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Unsupported QR code</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 break-all">{result.reason}</p>
              <button onClick={() => setResult(null)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">Scan again</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">QR Detected</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Type: <span className="font-medium">{result.kind === 'room' ? 'Local Room' : 'Shared File'}</span>
              </p>
              <div className="flex gap-2">
                <button onClick={openResult} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">
                  Open <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={() => setResult(null)} className="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg">Scan again</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};
