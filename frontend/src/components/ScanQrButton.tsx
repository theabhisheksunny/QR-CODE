import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { scan, resolveQrRoute, isScannerSupported } from '../services/scanner';

/**
 * Native-only Scan button (Android/iOS via ML Kit). Renders nothing on the web
 * build, where the camera scanner lives on the /scan page using BarcodeDetector.
 * The decoded value is classified by the SHARED resolveQrRoute() and routed:
 * - direct-share -> set API host + open /share/<token>
 * - room         -> set API host + open /room/<token>
 * - unsupported  -> "Unsupported QR code" (no navigation)
 */
const BASE_URL_KEY = 'qrshare_api_base_url';

export const ScanQrButton = () => {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);

  if (!isScannerSupported()) {
    return null;
  }

  const handleScan = async () => {
    setScanning(true);
    try {
      const raw = await scan();
      const route = resolveQrRoute(raw);

      if (route.kind === 'direct-share') {
        localStorage.setItem(BASE_URL_KEY, route.host);
        toast.success('Opening shared file');
        navigate(`/share/${route.token}`);
      } else if (route.kind === 'room') {
        localStorage.setItem(BASE_URL_KEY, route.host);
        toast.success('Opening room');
        navigate(`/room/${route.token}`);
      } else {
        toast.error('Unsupported QR code');
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
