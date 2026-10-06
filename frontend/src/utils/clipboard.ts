/**
 * Centralized clipboard utility. One implementation for web, the Windows JavaFX
 * WebView, and the Android/Capacitor WebView.
 *
 * Strategy:
 *   1. navigator.clipboard.writeText() (secure contexts / modern engines).
 *   2. Fallback to a hidden <textarea> + document.execCommand('copy') for older
 *      WebViews (JavaFX WebKit, some Android System WebViews) or non-secure
 *      origins where the async Clipboard API is unavailable/blocked.
 *
 * Returns true on success, false on failure — never throws, never silently
 * "succeeds" with nothing copied.
 */
export const copyText = async (value: string | null | undefined): Promise<boolean> => {
  const text = (value ?? '').toString();
  if (!text) return false;

  // 1) Async Clipboard API.
  try {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  // 2) Legacy execCommand fallback (works in WebViews / http origins).
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};
