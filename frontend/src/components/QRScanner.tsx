import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X, RotateCcw, Keyboard, Loader2, AlertCircle } from 'lucide-react';

/**
 * Reusable browser/webcam QR scanner.
 *
 * Decode strategy (no dependency on the experimental BarcodeDetector API):
 *   - Desktop host (Windows JavaFX WebView): if window.__qrDesktopScan exists,
 *     ALWAYS use the bridged native webcam scanner (WebKit has no getUserMedia).
 *   - Otherwise: getUserMedia + jsQR on canvas frames (works in any real
 *     browser/WebView with a camera). BarcodeDetector is only an optional
 *     fast-path when present.
 *   - Manual link entry appears only when the camera genuinely cannot be used.
 *
 * A live diagnostics line shows exactly which stage the path reached, so a
 * failing physical camera can be pinpointed instead of hidden behind a generic
 * "unavailable" message.
 */

interface QRScannerProps {
  onResult: (raw: string) => void;
  onCancel: () => void;
}

type State = 'init' | 'no-camera' | 'requesting' | 'scanning' | 'denied' | 'error' | 'desktop';

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};
declare global {
  interface Window {
    BarcodeDetector?: { new (opts?: { formats?: string[] }): BarcodeDetectorLike };
    __qrDesktopScan?: () => void;
  }
}

export const QRScanner = ({ onResult, onCancel }: QRScannerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const doneRef = useRef(false);
  const framesRef = useRef(0);

  const [state, setState] = useState<State>('init');
  const [manual, setManual] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [diag, setDiag] = useState('starting…');

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const finish = useCallback((raw: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDiag('QR detected — opening…');
    stop();
    onResult(raw);
  }, [onResult, stop]);

  const tick = useCallback(async () => {
    if (doneRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          framesRef.current += 1;
          if (framesRef.current % 15 === 0) {
            setDiag(`scanning ${w}×${h}, searching for QR… (frame ${framesRef.current})`);
          }
          if (detectorRef.current) {
            try {
              const codes = await detectorRef.current.detect(canvas);
              if (codes.length && codes[0].rawValue) { finish(codes[0].rawValue); return; }
            } catch { /* fall back to jsQR */ }
          }
          try {
            const imageData = ctx.getImageData(0, 0, w, h);
            const result = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
            if (result && result.data) { finish(result.data); return; }
          } catch { /* transient */ }
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [finish]);

  const start = useCallback(async () => {
    doneRef.current = false;
    framesRef.current = 0;
    setErrorMsg('');

    const hasDesktopBridge = typeof window.__qrDesktopScan === 'function';
    const hasGUM = !!navigator.mediaDevices?.getUserMedia;
    setDiag(`desktopBridge=${hasDesktopBridge} getUserMedia=${hasGUM} barcodeDetector=${!!window.BarcodeDetector}`);

    // Windows desktop host: ALWAYS prefer the native bridge when present
    // (the WebKit WebView's getUserMedia is non-functional even if it exists).
    if (hasDesktopBridge) {
      setState('desktop');
      setDiag('Opening native webcam scanner…');
      try { window.__qrDesktopScan!(); } catch (e) {
        setState('error');
        setErrorMsg('Native scanner failed to open: ' + ((e as Error)?.message || 'unknown'));
      }
      return;
    }

    if (!hasGUM) {
      setState('no-camera');
      setDiag('getUserMedia is not available in this browser/WebView.');
      return;
    }

    setState('requesting');
    setDiag('requesting camera permission…');
    try {
      if (window.BarcodeDetector) {
        try { detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] }); }
        catch { detectorRef.current = null; }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const label = stream.getVideoTracks()[0]?.label || 'camera';
      setDiag(`camera opened (${label}); starting preview…`);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
      setState('scanning');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = (e as { name?: string })?.name || 'Error';
      const msg = (e as Error)?.message || '';
      setDiag(`getUserMedia failed: ${name} ${msg}`);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setState('no-camera');
      } else if (name === 'NotReadableError') {
        setState('error');
        setErrorMsg('The camera is in use by another application.');
      } else {
        setState('error');
        setErrorMsg(`${name}: ${msg || 'Could not start the camera.'}`);
      }
    }
  }, [tick]);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSubmit = () => { if (manual.trim()) onResult(manual.trim()); };

  const showManual = state === 'no-camera' || state === 'denied' || state === 'error';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover ${state === 'scanning' ? '' : 'opacity-0'}`}
        />
        <canvas ref={canvasRef} className="hidden" />

        {state === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 h-2/3 border-2 border-white/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}

        {(state === 'init' || state === 'requesting' || state === 'desktop') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 p-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">
              {state === 'desktop' ? 'Opening native webcam window…' : 'Starting camera…'}
            </span>
          </div>
        )}
        {state === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400" />
            <p className="text-sm">Camera access is required to scan QR codes.</p>
          </div>
        )}
        {(state === 'error' || state === 'no-camera') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm">
              {state === 'no-camera'
                ? 'No camera is available in this browser. Use Paste Link / Value instead, or enter the link below.'
                : errorMsg}
            </p>
          </div>
        )}
      </div>

      {/* Live diagnostics so a failing camera path is visible, not hidden. */}
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center break-all max-w-sm">{diag}</p>

      {state === 'scanning' && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Point the camera at a Universal QR Sharing code.
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        {(state === 'denied' || state === 'error' || state === 'no-camera') && (
          <button onClick={start} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">
            <RotateCcw className="w-4 h-4" /> Retry Camera
          </button>
        )}
        <button onClick={() => { stop(); onCancel(); }} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>

      {showManual && (
        <div className="w-full max-w-sm">
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5 mb-2">
            <Keyboard className="w-4 h-4" /> Or enter the QR link manually
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="http://192.168.x.x:8787/room/… or /share/…"
              className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <button onClick={handleManualSubmit} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1">
              <Camera className="w-4 h-4" /> Open
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
