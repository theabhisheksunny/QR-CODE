import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { scan, parseScan, isScannerSupported } from '../services/scanner';

/**
 * Native-only Scan button. Renders nothing on the web build (desktop/dev),
 * so the SAME React UI is reused across platforms without a second app.
 *
 * On a successful scan the raw value is classified by parseScan() and routed:
 * - share URL  -> store the host as the API base + open the in-app share view
 * - plain URL  -> hand off to the system browser
 * - json/number/text -> surface the decoded value to the user
 */
const BASE_URL_KEY = 'qrshare_api_base_url';

export const ScanQrButton = () => {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);

  // Reuse the SAME UI everywhere; the scanner is a native-only capability.
  if (!isScannerSupported()) {
    return null;
  }

  const handleScan = async () => {
    setScanning(true);
    try {
      const raw = await scan();
      const result = parseScan(raw);

      switch (result.kind) {
        case 'share':
          // Point the shared API client at the host that produced this QR,
          // then open the existing in-app share flow — no duplicated logic.
          localStorage.setItem(BASE_URL_KEY, result.baseUrl);
          toast.success('Opening shared file');
          navigate(`/share/${result.token}`);
          break;
        case 'url':
          window.open(result.url, '_blank', 'noopener,noreferrer');
          break;
        case 'json':
          toast.success('Scanned JSON');
          navigate('/text', { state: { scanned: JSON.stringify(result.value, null, 2) } });
          break;
        case 'number':
          toast.success(`Scanned number: ${result.value}`);
          navigate('/text', { state: { scanned: result.raw } });
          break;
        case 'text':
        default:
          toast.success('Scanned text');
          navigate('/text', { state: { scanned: result.raw } });
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan QR code.';
      toast.error(message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <button
      onClick={handleScan}
      disabled={scanning}
      aria-label="Scan a QR code with the camera"
      className="flex items-center justify-center gap-2 w-full max-w-2xl py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
    >
      {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanLine className="w-5 h-5" />}
      {scanning ? 'Scanning…' : 'Scan QR Code'}
    </button>
  );
};
