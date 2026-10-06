import { Capacitor } from '@capacitor/core';

/**
 * Single source of truth for platform selection. Used to pick the correct
 * scanner implementation and download/save flow per platform — no ambiguous
 * fallbacks between platforms.
 *
 *   - 'android' (or 'ios'): Capacitor native app  → ML Kit scanner, native save
 *   - 'desktop'           : Windows JavaFX WebView → native webcam scanner, native save
 *   - 'web'               : a real browser         → getUserMedia + jsQR, browser download
 */
export type Platform = 'android' | 'ios' | 'desktop' | 'web';

/** True inside the Capacitor native app (Android/iOS). */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * True inside the Windows desktop host (JavaFX WebView). The DesktopLauncher
 * sets a distinctive user-agent suffix AND installs window.__qrDesktopScan;
 * either signal identifies the desktop host.
 */
export const isDesktop = (): boolean => {
  if (isNative()) return false;
  const ua = (navigator.userAgent || '');
  const hasBridge = typeof (window as unknown as { __qrDesktopScan?: unknown }).__qrDesktopScan === 'function';
  return hasBridge || ua.includes('UniversalQRSharing/Desktop');
};

export const getPlatform = (): Platform => {
  if (isNative()) {
    return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  }
  if (isDesktop()) return 'desktop';
  return 'web';
};

/** Platforms whose WebView would render files inline instead of saving them. */
export const needsNativeDownload = (): boolean => {
  const p = getPlatform();
  return p === 'android' || p === 'ios' || p === 'desktop';
};
