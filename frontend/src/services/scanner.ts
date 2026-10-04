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
  | { kind: 'url'; url: string; raw: string }
  | { kind: 'json'; value: unknown; raw: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'text'; raw: string };

/**
 * Classify a scanned string into the handling categories the app cares about:
 *
 * - share  : a Universal QR share URL http://<ip>:<port>/share/<token>
 *            -> the app should set the host base + open the in-app share view.
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
    const shareMatch = parsedUrl.pathname.match(/^\/share\/([^/]+)\/?$/);
    if (shareMatch) {
      return {
        kind: 'share',
        token: decodeURIComponent(shareMatch[1]),
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
