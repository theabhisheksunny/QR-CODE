import { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { FileUploadResponse } from '../types';
import { uploadFile } from '../api/files';

type UploadState = 'idle' | 'uploading' | 'done' | 'error' | 'cancelled';

export const useFileShare = () => {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<FileUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(async (file: File, expirationMinutes: number) => {
    setState('uploading');
    setProgress(0);
    setLoaded(0);
    setTotal(file.size);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await uploadFile(
        file,
        expirationMinutes,
        (percent, loadedBytes, totalBytes) => {
          setProgress(percent);
          setLoaded(loadedBytes);
          setTotal(totalBytes);
        },
        controller.signal
      );
      setResult(response);
      setState('done');
      return response;
    } catch (err: unknown) {
      if (axios.isCancel(err) || (err instanceof Error && err.name === 'CanceledError')) {
        setState('cancelled');
        setError('Upload cancelled');
        throw err;
      }
      // Prefer a meaningful server-provided reason over a generic message.
      let message = 'Upload failed';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string; error?: string } | undefined;
        message = data?.message || data?.error || err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
      setState('error');
      throw err;
    } finally {
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState('idle');
    setProgress(0);
    setLoaded(0);
    setTotal(0);
    setResult(null);
    setError(null);
  }, []);

  return { state, progress, loaded, total, result, error, upload, cancel, reset };
};
