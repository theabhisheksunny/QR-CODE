import { useState, useCallback } from 'react';
import { FileUploadResponse } from '../types';
import { uploadFile } from '../api/files';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export const useFileShare = () => {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<FileUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File, expirationMinutes: number) => {
    setState('uploading');
    setProgress(0);
    setError(null);
    try {
      const response = await uploadFile(file, expirationMinutes, setProgress);
      setResult(response);
      setState('done');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setState('error');
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  return { state, progress, result, error, upload, reset };
};
