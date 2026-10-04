import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.universalqr.sharing',
  appName: 'Universal QR Sharing',
  webDir: 'dist',
  android: {
    // Required so the WebView can reach the LAN backend over plain http://
    // (local Wi-Fi sharing has no TLS). Scoped further via
    // network_security_config.xml which limits cleartext to private IP ranges.
    allowMixedContent: true,
  },
};

export default config;
