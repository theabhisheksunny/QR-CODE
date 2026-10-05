import { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { FileUploadZone } from '../components/FileUploadZone';
import { ExpirationSelector } from '../components/ExpirationSelector';
import { UploadProgress } from '../components/UploadProgress';
import { FileCard } from '../components/FileCard';
import { useFileShare } from '../hooks/useFileShare';
import { useQrHistory } from '../hooks/useQrHistory';

export const FileQrPage = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expirationMinutes, setExpirationMinutes] = useState(30);
  const { state, progress, loaded, total, result, upload, cancel, reset } = useFileShare();
  const { addEntry } = useQrHistory();

  const handleUpload = async () => {
    if (!selectedFile) { toast.error('Please select a file'); return; }
    try {
      const res = await upload(selectedFile, expirationMinutes);
      addEntry({
        type: 'file',
        label: selectedFile.name,
        qrCode: res.qrCode,
        fileId: res.id,
        shareUrl: res.shareUrl,
        expiresAt: res.expiresAt,
      });
      toast.success('File uploaded successfully!');
    } catch (err: unknown) {
      // Cancellation is a user action, not an error toast-worthy failure.
      const name = (err as { name?: string })?.name;
      if (name === 'CanceledError' || name === 'AbortError') {
        toast('Upload cancelled');
        return;
      }
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Upload failed. Please try again.');
    }
  };

  const handleReset = () => {
    reset();
    setSelectedFile(null);
  };

  const uploading = state === 'uploading';

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">File Share QR</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Upload a file and get a QR code to share it with any device</p>
      </div>
      {state !== 'done' ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
          <FileUploadZone onFileSelect={setSelectedFile} selectedFile={selectedFile} disabled={uploading} />
          <ExpirationSelector value={expirationMinutes} onChange={setExpirationMinutes} disabled={uploading} />
          {uploading && <UploadProgress progress={progress} loaded={loaded} total={total} onCancel={cancel} />}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload & Generate QR'}
          </button>
        </div>
      ) : result ? (
        <div className="flex flex-col gap-4">
          <FileCard file={result} onDeleted={handleReset} />
          <button onClick={handleReset} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            Share another file
          </button>
        </div>
      ) : null}
    </div>
  );
};
