import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Capacitor Android dynamic-import fix (keeps web + Windows correct):
//
// The regression "Failed to fetch dynamically imported module" in the Android
// Capacitor WebView was caused by Vite injecting `<link rel="modulepreload"
// crossorigin>` tags for lazily-imported chunks (React.lazy import('./PdfViewer')).
// On Capacitor's custom-scheme origin the crossorigin preload is rejected, which
// then fails the dynamic import() of that chunk.
//
// Fix: disable modulePreload link injection. Dynamic import() still works on
// every platform; the chunk is simply fetched on demand without a (failing)
// crossorigin preload.
//
// We intentionally KEEP the default absolute base ('/'). A relative base ('./')
// would break the web/Windows SPA deep routes (/share/<token>, /room/<token>)
// because the browser would resolve ./assets against /share/ -> 404. Absolute
// /assets/... is served correctly by Spring Boot (web/Windows) AND by the
// Capacitor origin root on Android.
export default defineConfig({
  plugins: [react()],
  build: {
    modulePreload: false,
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true }
    }
  }
})
