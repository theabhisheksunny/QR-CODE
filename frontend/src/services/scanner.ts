import { Capacitor } from '@capacitor/core';

/**
 * Scanner service — single abstraction over the native QR/barcode scanner.
 *
 * Native (Android/iOS): uses @capacitor-mlkit/barcode-scanning, which runs
 * fully on-device (no network). Web: scanning is not supported here (the
 * desktop/web build shares the same React UI but has no camera scanner), so
 * scan() throws a clear, actionable error that callers surface to the user.
 */

export class ScannerNotSupportedError extends Error {
  constructor() {
    super('QR scanning is only available in the Android app.');
    this.name = 'ScannerNotSupportedError';
  }
}

export const isScannerSupported = (): boolean => Capacitor.isNativePlatform();

/**
 * Scan a single QR/barcode and resolve its raw string value.
 *
 * The plugin is imported dynamically so the web build (which never calls scan())
 * does not need to resolve the native module at startup.
 */
export const scan = async (): Promise<string> => {
  if (!isScannerSupported()) {
    throw new ScannerNotSupportedError();
  }

  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');

  // Ensure the ML Kit module is available, then request camera permission.
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) {
    throw new Error('The barcode scanner is not supported on this device.');
  }

  const permission = await BarcodeScanner.requestPermissions();
  if (permission.camera !== 'granted' && permission.camera !== 'limited') {
    throw new Error('Camera permission is required to scan QR codes.');
  }

  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.QrCode],
  });

  if (!barcodes.length) {
    throw new Error('No QR code detected.');
  }

  return barcodes[0].rawValue;
};

export type ParsedScan =
  | { kind: 'share'; token: string; baseUrl: string; raw: string }
  | { kind: 'room'; token: string; baseUrl: string; raw: string }
  | { kind: 'url'; url: string; raw: string }
  | { kind: 'json'; value: unknown; raw: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'text'; raw: string };

/**
 * Classify a scanned string into the handling categories the app cares about:
 *
 * - share  : a Universal QR share URL http://<ip>:<port>/share/<token>
 *            -> the app should set the host base + open the in-app share view.
 * - room    : a Universal QR room URL http://<ip>:<port>/room/<token>
 *            -> set the host base + open the room join view.
 * - url     : any other http(s) URL -> offer to the system browser.
 * - json    : parseable JSON object/array -> display.
 * - number  : a plain numeric value -> display.
 * - text    : anything else -> display.
 */
export const parseScan = (raw: string): ParsedScan => {
  const trimmed = raw.trim();

  // Try to parse as a URL first.
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    parsedUrl = null;
  }

  if (parsedUrl && (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:')) {
    const shareMatch = parsedUrl.pathname.match(/^\/share\/([A-Za-z0-9_-]+)\/?$/);
    if (shareMatch) {
      return {
        kind: 'share',
        token: decodeURIComponent(shareMatch[1]),
        baseUrl: parsedUrl.origin,
        raw: trimmed,
      };
    }
    const roomMatch = parsedUrl.pathname.match(/^\/room\/([A-Za-z0-9_-]+)\/?$/);
    if (roomMatch) {
      return {
        kind: 'room',
        token: decodeURIComponent(roomMatch[1]),
        baseUrl: parsedUrl.origin,
        raw: trimmed,
      };
    }
    return { kind: 'url', url: trimmed, raw: trimmed };
  }

  // JSON object/array.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { kind: 'json', value: JSON.parse(trimmed), raw: trimmed };
    } catch {
      // not valid JSON, fall through to text
    }
  }

  // Plain number.
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
    return { kind: 'number', value: Number(trimmed), raw: trimmed };
  }

  return { kind: 'text', raw: trimmed };
};

/**
 * The ONLY QR shapes the application will act on by navigating. Anything else
 * is reported as unsupported — the scanner is NOT a generic URL launcher
 * (directive #6). A `host` is included so callers can repoint the API client at
 * the device that produced the QR (LAN host).
 */
export type QrRoute =
  | { kind: 'direct-share'; token: string; host: string; raw: string }
  | { kind: 'room'; token: string; host: string; raw: string }
  | { kind: 'unsupported'; raw: string; reason: string };

/**
 * Shared QR route resolver used by every platform (web webcam, Windows EXE
 * webcam bridge, Android ML Kit). Accepts ONLY the application's own
 * {@code /share/<token>} and {@code /room/<token>} URL patterns over http(s);
 * every other QR (arbitrary URLs, text, etc.) resolves to `unsupported` so the
 * scanner never performs arbitrary navigation.
 */
export const resolveQrRoute = (raw: string): QrRoute => {
  const parsed = parseScan(raw);
  switch (parsed.kind) {
    case 'share':
      return { kind: 'direct-share', token: parsed.token, host: parsed.baseUrl, raw: parsed.raw };
    case 'room':
      return { kind: 'room', token: parsed.token, host: parsed.baseUrl, raw: parsed.raw };
    default:
      return {
        kind: 'unsupported',
        raw: raw.trim(),
        reason: 'Not a Universal QR Sharing code (expected a /share or /room link).',
      };
  }
};
