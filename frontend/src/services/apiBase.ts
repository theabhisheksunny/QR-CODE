import client from '../api/client';
import { isNative } from './platform';

const BASE_URL_KEY = 'qrshare_api_base_url';

/**
 * Authoritative API-host rule:
 *
 *   The host of the CURRENT application /share|/room URL is authoritative and
 *   must replace any stale qrshare_api_base_url. A previously stored value must
 *   never win over the host of the URL the user is actually on.
 *
 * Precedence when establishing the base:
 *   1. An explicit host from a scanned/pasted link (scanner/paste pass it in).
 *   2. The current page origin — but ONLY when this page is itself a served
 *      application URL (web/desktop served by Device A). On the native
 *      Capacitor app the origin is a local file://-style scheme and is NOT a
 *      valid API host, so the stored value (set in Settings or by a scan) wins.
 *
 * Centralized here so ScanPage, PastePage, RoomPage, SharePage and the axios
 * client all agree on one rule.
 */

/** Persist a resolved base and point the axios client at it immediately. */
export const setApiBase = (host: string): void => {
  if (!host) return;
  const clean = host.replace(/\/$/, '');
  localStorage.setItem(BASE_URL_KEY, clean);
  client.defaults.baseURL = clean;
};

export const getApiBase = (): string =>
  (client.defaults.baseURL || localStorage.getItem(BASE_URL_KEY) || '').replace(/\/$/, '');

/**
 * Establish the authoritative base from an EXPLICIT host (scanner/paste result).
 * Always overrides any stale value.
 */
export const establishFromHost = (host: string): void => setApiBase(host);

/**
 * Establish the authoritative base when landing directly on an application URL
 * (direct browser navigation to /room/:token or /share/:token). On a served
 * web/desktop page the current origin IS the authoritative host and must
 * override a stale stored value. On the native app we keep the configured base.
 */
export const establishFromCurrentUrl = (): string => {
  if (isNative()) {
    // file://-style origin is not an API host; trust the configured/scanned base.
    return getApiBase();
  }
  const origin = window.location.origin;
  // Only treat http(s) origins as authoritative hosts.
  if (/^https?:\/\//i.test(origin)) {
    setApiBase(origin);
    return origin;
  }
  return getApiBase();
};
