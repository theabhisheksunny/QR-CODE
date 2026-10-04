import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const BASE_URL_KEY = 'qrshare_api_base_url';

/**
 * Resolve the API base URL for the current platform.
 *
 * - Native (Capacitor Android/iOS): the app is a CLIENT with no local backend,
 *   so it must talk to a reachable host (Device A). That host is configured
 *   once in Settings and stored under `qrshare_api_base_url`
 *   (e.g. http://172.20.10.2:8787).
 * - Web (dev + packaged desktop): keep a relative base ('') so requests hit the
 *   Vite dev proxy or the same origin that serves the SPA.
 *
 * A stored override always wins when present (so the web build can also point at
 * a remote backend if the user sets one). The platform only changes the default.
 */
const getBaseUrl = (): string => {
  const stored = localStorage.getItem(BASE_URL_KEY);
  if (stored) {
    return stored;
  }
  // On native there is no same-origin backend to fall back to, so a relative
  // base cannot work. Return '' and let the request interceptor pick up the
  // configured value once the user saves it in Settings.
  return '';
};

const client = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Accept': 'application/json',
  },
});

client.interceptors.request.use((config) => {
  const base = localStorage.getItem(BASE_URL_KEY);
  if (base) {
    config.baseURL = base;
  } else if (Capacitor.isNativePlatform()) {
    // Native build without a configured host: fail fast with a clear message
    // instead of issuing a request against the app's own file:// origin.
    return Promise.reject(
      new Error('No API base URL configured. Open Settings and set the host (e.g. http://172.20.10.2:8787).')
    );
  }
  return config;
});

export default client;
