import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X, RotateCcw, Keyboard, Loader2, AlertCircle, Flashlight } from 'lucide-react';

/**
 * Fast, reliable browser/webcam QR scanner.
 *
 * Performance strategy (see audit): decode a CENTERED REGION OF INTEREST at a
 * small fixed size every frame with the fast jsQR path (dontInvert), and only
 * occasionally fall back to a full-frame + inverted pass. This avoids the two
 * big costs of the old loop: a full-resolution getImageData allocation every
 * frame and jsQR 'attemptBoth' (2x work) every frame. BarcodeDetector, when
 * present, runs on the same small ROI canvas as a fast path. No React state is
 * updated inside the frame loop (counters live in refs).
 *
 * Platform routing:
 *   - Windows JavaFX WebView: window.__qrDesktopScan native webcam bridge.
 *   - Real browser/WebView: getUserMedia + ROI jsQR/BarcodeDetector.
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

// ROI processing size (square). The camera frame's centre is cropped+scaled into
// a canvas of this size, so jsQR always works on a bounded, small buffer
// regardless of camera resolution. 512 is plenty for QR at normal distances.
const ROI_SIZE = 512;
// Fraction of the smaller video dimension used as the ROI (matches the on-screen
// scan box). Large enough that users don't need precise alignment.
const ROI_FRACTION = 0.72;
// Every Nth frame, also try a full-frame + inverted decode (handles far/small or
// dark-on-light inverted codes) without paying that cost on every frame.
const FULL_FRAME_EVERY = 8;

export const QRScanner = ({ onResult, onCancel }: QRScannerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Reusable canvases: one small ROI canvas (hot path), one full-frame canvas
  // (only used on the periodic fallback). Allocated once, never per frame.
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const doneRef = useRef(false);
  const framesRef = useRef(0);
  // Dev telemetry (not rendered to normal users; no per-frame React state).
  const telemetryRef = useRef({ cameraInit: 0, firstFrame: 0, decodeStart: 0, frames: 0, attempts: 0 });

  const [state, setState] = useState<State>('init');
  const [manual, setManual] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [detected, setDetected] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  const finish = useCallback((raw: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDetected(true);          // brief success indication
    stop();                     // stop camera + tracks immediately
    onResult(raw);              // resolve + navigate (no further decoding)
  }, [onResult, stop]);

  const getRoiCanvas = () => {
    if (!roiCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = ROI_SIZE; c.height = ROI_SIZE;
      roiCanvasRef.current = c;
    }
    return roiCanvasRef.current;
  };
  const getFullCanvas = () => {
    if (!fullCanvasRef.current) fullCanvasRef.current = document.createElement('canvas');
    return fullCanvasRef.current;
  };

  const tick = useCallback(() => {
    if (doneRef.current) return;
    const video = videoRef.current;
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        if (telemetryRef.current.firstFrame === 0) telemetryRef.current.firstFrame = performance.now();
        framesRef.current += 1;
        telemetryRef.current.frames = framesRef.current;

        // --- FAST PATH: centered ROI drawn into the small reusable canvas ---
        const side = Math.floor(Math.min(vw, vh) * ROI_FRACTION);
        const sx = Math.floor((vw - side) / 2);
        const sy = Math.floor((vh - side) / 2);
        const roi = getRoiCanvas();
        const rctx = roi.getContext('2d', { willReadFrequently: true });
        if (rctx) {
          rctx.drawImage(video, sx, sy, side, side, 0, 0, ROI_SIZE, ROI_SIZE);

          // BarcodeDetector fast path on the small ROI (if available). We do not
          // let a BarcodeDetector rejection block jsQR — jsQR runs right after.
          if (detectorRef.current) {
            detectorRef.current.detect(roi)
              .then((codes) => { if (codes.length && codes[0].rawValue) finish(codes[0].rawValue); })
              .catch(() => { /* ignore; jsQR covers it */ });
          }

          // jsQR fast path: normal orientation only (dontInvert) — cheap.
          try {
            const img = rctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
            telemetryRef.current.attempts += 1;
            const result = jsQR(img.data, ROI_SIZE, ROI_SIZE, { inversionAttempts: 'dontInvert' });
            if (result && result.data) { finish(result.data); return; }
          } catch { /* transient */ }
        }

        // --- FALLBACK (periodic): full frame + inverted, for far/small/inverted QR ---
        if (framesRef.current % FULL_FRAME_EVERY === 0) {
          const full = getFullCanvas();
          if (full.width !== vw || full.height !== vh) { full.width = vw; full.height = vh; }
          const fctx = full.getContext('2d', { willReadFrequently: true });
          if (fctx) {
            fctx.drawImage(video, 0, 0, vw, vh);
            try {
              const img = fctx.getImageData(0, 0, vw, vh);
              telemetryRef.current.attempts += 1;
              const result = jsQR(img.data, vw, vh, { inversionAttempts: 'attemptBoth' });
              if (result && result.data) { finish(result.data); return; }
            } catch { /* transient */ }
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [finish]);

  const start = useCallback(async () => {
    doneRef.current = false;
    framesRef.current = 0;
    setErrorMsg('');
    setDetected(false);
    setTorchAvailable(false);
    setTorchOn(false);

    const hasDesktopBridge = typeof window.__qrDesktopScan === 'function';
    const hasGUM = !!navigator.mediaDevices?.getUserMedia;

    // Windows desktop host: ALWAYS prefer the native bridge when present.
    if (hasDesktopBridge) {
      setState('desktop');
      try { window.__qrDesktopScan!(); } catch (e) {
        setState('error');
        setErrorMsg('Native scanner failed to open: ' + ((e as Error)?.message || 'unknown'));
      }
      return;
    }

    if (!hasGUM) {
      setState('no-camera');
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setErrorMsg('Camera scanning isn’t available over HTTP on this network address. Your browser requires HTTPS or localhost for camera access. Use Paste Link or enter the link below.');
      } else {
        setErrorMsg('This browser does not expose a camera API. Use Paste Link or enter the link below.');
      }
      return;
    }

    setState('requesting');
    try {
      if (window.BarcodeDetector) {
        try { detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] }); }
        catch { detectorRef.current = null; }
      }
      telemetryRef.current.cameraInit = performance.now();
      // Capability-aware constraints: prefer the rear camera at a reasonable
      // resolution. Exact values are only *ideal* hints so unsupported devices
      // still get a stream.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] || null;
      trackRef.current = track;

      // Apply continuous autofocus only if the device reports support.
      try {
        const caps = (track?.getCapabilities?.() || {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
        const advanced: MediaTrackConstraintSet[] = [];
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          (advanced as Array<Record<string, unknown>>).push({ focusMode: 'continuous' });
        }
        if (advanced.length) await track?.applyConstraints({ advanced } as MediaTrackConstraints);
        if (caps.torch) setTorchAvailable(true);
      } catch { /* capability tuning is best-effort */ }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
      setState('scanning');
      telemetryRef.current.decodeStart = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = (e as { name?: string })?.name || 'Error';
      const msg = (e as Error)?.message || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setState('no-camera');
        setErrorMsg('No camera was found on this device. Use Paste Link or enter the link below.');
      } else if (name === 'NotReadableError') {
        setState('error');
        setErrorMsg('The camera is in use by another application.');
      } else {
        setState('error');
        setErrorMsg(`${name}: ${msg || 'Could not start the camera.'}`);
      }
    }
  }, [tick]);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch { /* torch not controllable */ }
  }, [torchOn]);

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

        {/* Centered scan box + animated scan line (matches the ROI region). */}
        {state === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`relative rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] border-2 transition-colors ${
                detected ? 'border-green-400' : 'border-white/80'
              }`}
              style={{ width: '72%', height: '72%' }}
            >
              {/* corner accents */}
              <span className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
              <span className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
              <span className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
              <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
              {!detected && (
                <span className="qr-scan-line absolute left-2 right-2 h-0.5 bg-indigo-400/90 rounded-full" />
              )}
            </div>
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
            <p className="text-sm">{errorMsg || 'Camera unavailable. Use Paste Link or enter the link below.'}</p>
          </div>
        )}

        {/* Torch button (only when the device reports torch capability). */}
        {state === 'scanning' && torchAvailable && (
          <button
            onClick={toggleTorch}
            aria-label="Toggle flashlight"
            className={`absolute bottom-3 right-3 p-2.5 rounded-full ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/50 text-white'}`}
          >
            <Flashlight className="w-5 h-5" />
          </button>
        )}
      </div>

      {state === 'scanning' && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Point your camera at a QR code
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
