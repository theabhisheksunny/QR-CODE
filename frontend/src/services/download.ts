import client from '../api/client';
import { getPlatform } from './platform';

/**
 * Builds an ABSOLUTE download URL against the configured API host (Device A),
 * using the dedicated /download endpoint (Content-Disposition: attachment).
 * Backend streaming + HTTP Range are unchanged.
 */
const apiBase = (): string => (client.defaults.baseURL || '').replace(/\/$/, '');

export const shareDownloadUrl = (token: string): string =>
  `${apiBase()}/api/files/share/${token}/download`;

export const roomFileDownloadUrl = (roomToken: string, fileToken: string): string =>
  `${apiBase()}/api/rooms/${roomToken}/files/${fileToken}/download`;

/** Inline (previewable) URL — NOT forced attachment — for embedded viewers. */
export const sharePreviewUrl = (token: string): string =>
  `${apiBase()}/api/files/share/${token}`;

export const roomFilePreviewUrl = (roomToken: string, fileToken: string): string =>
  `${apiBase()}/api/rooms/${roomToken}/files/${fileToken}`;

/** Safe, non-secret download trace — NEVER contains tokens or session values. */
export type DownloadTrace = {
  platform: string;
  mode: 'native-desktop' | 'android-downloadmanager' | 'android-system' | 'browser-anchor' | 'navigate';
  urlHost: string;
  endpoint: 'quick-share' | 'room' | 'unknown';
  nativeBridgeAvailable: boolean;
  /** Whether we actually called the native bridge function. */
  nativeBridgeInvoked: boolean;
  /** Whether the native side acknowledged the download started (result callback). */
  nativeDownloadStarted: boolean;
  /** Readable diagnostic lines (safe). */
  trace: string[];
};

export type DownloadResult = { ok: boolean; message: string; path?: string; diagnostics?: DownloadTrace };

/** Extracts ONLY the host[:port] from a URL — no path, no query, no tokens. */
const hostOf = (url: string): string => {
  try { const u = new URL(url); return u.host || '(relative)'; } catch { return '(unparseable)'; }
};

/** Classifies the endpoint from the URL PATH shape — without exposing any token. */
const endpointOf = (url: string): DownloadTrace['endpoint'] => {
  if (url.includes('/api/rooms/')) return 'room';
  if (url.includes('/api/files/share/')) return 'quick-share';
  return 'unknown';
};

/** Timeout for waiting for native bridge result (ms). If the Java side never
 *  calls __qrDownloadResult (e.g. bridge was GC'd), we detect it instead of
 *  hanging forever. */
const NATIVE_RESULT_TIMEOUT_MS = 15_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;

/**
 * Probes the desktop bridge at the moment of the call and returns live diagnostics.
 * This checks BOTH the JS wrapper AND the underlying Java bridge object.
 */
const probeDesktopBridge = (): { hasWrapper: boolean; hasBridge: boolean; bridgeType: string; pingResult: string } => {
  const hasWrapper = typeof w.__qrDownload === 'function';
  let hasBridge = false;
  let bridgeType = '(absent)';
  let pingResult = '(not called)';
  try {
    if (w.__qrBridge != null) {
      hasBridge = true;
      bridgeType = typeof w.__qrBridge;
      // Try calling toString to see if the Java object is still alive
      try { bridgeType = String(w.__qrBridge); } catch { bridgeType = '(GC or dead)'; }
    }
  } catch { /* bridge gone */ }
  // Diagnostic ping — calls the Java ping() method to confirm it's alive
  try {
    if (typeof w.__qrBridgePing === 'function') {
      pingResult = String(w.__qrBridgePing());
    }
  } catch (e) { pingResult = `THREW:${e}`; }
  return { hasWrapper, hasBridge, bridgeType, pingResult };
};

/**
 * Probes the Android bridge at the moment of the call.
 */
const probeAndroidBridge = (): { hasWrapper: boolean; hasBridge: boolean; bridgeType: string; pingResult: string } => {
  const hasWrapper = typeof w.__qrAndroidDownload === 'function';
  let hasBridge = false;
  let bridgeType = '(absent)';
  let pingResult = '(not called)';
  try {
    if (w.__qrAndroidBridge != null) {
      hasBridge = true;
      bridgeType = typeof w.__qrAndroidBridge;
      try { bridgeType = String(w.__qrAndroidBridge); } catch { bridgeType = '(dead)'; }
    }
  } catch { /* bridge gone */ }
  try {
    if (typeof w.__qrAndroidPing === 'function') {
      pingResult = String(w.__qrAndroidPing());
    }
  } catch (e) { pingResult = `THREW:${e}`; }
  return { hasWrapper, hasBridge, bridgeType, pingResult };
};

/**
 * Triggers a SAVE of the file, keeping the user inside the installed app.
 * Returns a trace of every decision point so failures are immediately diagnosable.
 */
export const triggerDownload = (url: string, filename?: string): Promise<DownloadResult> => {
  const platform = getPlatform();
  const trace: string[] = [];
  const diag: DownloadTrace = {
    platform,
    mode: 'navigate',
    urlHost: hostOf(url),
    endpoint: endpointOf(url),
    nativeBridgeAvailable: false,
    nativeBridgeInvoked: false,
    nativeDownloadStarted: false,
    trace,
  };

  trace.push(`platform=${platform}`);
  trace.push(`host=${diag.urlHost}`);
  trace.push(`endpoint=${diag.endpoint}`);
  trace.push(`filename=${filename ?? '(none)'}`);

  // ========== DESKTOP (Windows JavaFX WebView) ==========
  if (platform === 'desktop') {
    const probe = probeDesktopBridge();
    trace.push(`desktop.wrapper=${probe.hasWrapper}`);
    trace.push(`desktop.bridge=${probe.hasBridge}`);
    trace.push(`desktop.bridgeType=${probe.bridgeType}`);
    trace.push(`desktop.ping=${probe.pingResult}`);

    if (probe.hasWrapper && probe.hasBridge && probe.pingResult === 'ALIVE') {
      diag.mode = 'native-desktop';
      diag.nativeBridgeAvailable = true;

      return new Promise<DownloadResult>((resolve) => {
        let settled = false;

        // Result callback from Java ScanBridge.downloadResult()
        w.__qrDownloadResult = (ok: boolean, message: string, path: string) => {
          if (settled) return;
          settled = true;
          diag.nativeDownloadStarted = true;
          trace.push(`result.ok=${ok}`);
          trace.push(`result.message=${message}`);
          trace.push(`result.path=${path || '(no path)'}`);
          resolve({ ok, message, path: path || undefined, diagnostics: diag });
        };

        // Invoke the wrapper (which calls __qrBridge.download inside try/catch)
        trace.push('invoking __qrDownload...');
        diag.nativeBridgeInvoked = true;
        try {
          w.__qrDownload(url, filename);
          trace.push('__qrDownload returned (no throw)');
        } catch (e) {
          trace.push(`__qrDownload THREW: ${e}`);
          settled = true;
          resolve({ ok: false, message: `Bridge call threw: ${e}`, diagnostics: diag });
          return;
        }

        // Timeout: if Java never calls __qrDownloadResult, the bridge is dead.
        setTimeout(() => {
          if (!settled) {
            settled = true;
            trace.push(`TIMEOUT ${NATIVE_RESULT_TIMEOUT_MS}ms — Java never responded`);
            resolve({
              ok: false,
              message: 'Download bridge did not respond (Java bridge may have been garbage-collected)',
              diagnostics: diag,
            });
          }
        }, NATIVE_RESULT_TIMEOUT_MS);
      });
    }

    // Bridge NOT available
    trace.push('desktop bridge MISSING — using fallback');

    // Prefer openExternal (real OS browser) over in-WebView navigation
    if (typeof w.__qrOpenExternal === 'function') {
      diag.mode = 'navigate';
      trace.push('fallback=__qrOpenExternal (OS browser)');
      w.__qrOpenExternal(url);
      return Promise.resolve({
        ok: true,
        message: 'Opening in your browser to save…',
        diagnostics: diag,
      });
    }
    trace.push('fallback=location.href (WebView navigation — may not save)');
    window.location.href = url;
    return Promise.resolve({
      ok: true,
      message: 'Starting download…',
      diagnostics: diag,
    });
  }

  // ========== ANDROID / iOS ==========
  if (platform === 'android' || platform === 'ios') {
    if (platform === 'android') {
      const probe = probeAndroidBridge();
      trace.push(`android.wrapper=${probe.hasWrapper}`);
      trace.push(`android.bridge=${probe.hasBridge}`);
      trace.push(`android.bridgeType=${probe.bridgeType}`);
      trace.push(`android.ping=${probe.pingResult}`);

      if (probe.hasWrapper && probe.hasBridge && probe.pingResult === 'ALIVE') {
        diag.mode = 'android-downloadmanager';
        diag.nativeBridgeAvailable = true;
        diag.nativeBridgeInvoked = true;
        trace.push('invoking __qrAndroidDownload...');
        try {
          w.__qrAndroidDownload(url, filename);
          diag.nativeDownloadStarted = true;
          trace.push('__qrAndroidDownload returned (no throw)');
          trace.push('status=QUEUED (DownloadManager enqueued; completion is async)');
        } catch (e) {
          trace.push(`__qrAndroidDownload THREW: ${e}`);
          return Promise.resolve({
            ok: false,
            message: `Android bridge call threw: ${e}`,
            diagnostics: diag,
          });
        }
        return Promise.resolve({
          ok: true,
          message: 'Download queued — check notification bar for progress',
          diagnostics: diag,
        });
      }
      trace.push('android bridge MISSING — using fallback');
    }

    // Fallback: hand off to the OS (system browser / download manager).
    diag.mode = 'android-system';
    trace.push('fallback=window.open(_system)');
    window.open(url, '_system');
    return Promise.resolve({
      ok: true,
      message: 'Handed to system browser — check Downloads/notifications',
      diagnostics: diag,
    });
  }

  // ========== WEB ==========
  diag.mode = 'browser-anchor';
  trace.push('mode=browser-anchor (<a download>)');
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return Promise.resolve({
    ok: true,
    message: 'Download started',
    diagnostics: diag,
  });
};
