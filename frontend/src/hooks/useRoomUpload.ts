import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { uploadRoomFile, uploadDiagnostics } from '../api/rooms';
import { RoomFile } from '../types';

type UploadState = 'idle' | 'uploading' | 'done' | 'error' | 'cancelled';

/** Upload-to-room with real progress + cancellation (reuses streaming upload). */
export const useRoomUpload = (roomToken: string, sessionToken: string | null) => {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(async (file: File): Promise<RoomFile | null> => {
    if (!sessionToken) { setError('Not joined to this room'); setState('error'); return null; }
    setState('uploading'); setProgress(0); setLoaded(0); setTotal(file.size); setError(null); setDiagnostics(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const d = uploadDiagnostics(roomToken, sessionToken);
    try {
      const rf = await uploadRoomFile(roomToken, sessionToken, file, (p, l, t) => {
        setProgress(p); setLoaded(l); setTotal(t);
      }, controller.signal);
      setState('done');
      return rf;
    } catch (err: unknown) {
      if (axios.isCancel(err) || (err instanceof Error && err.name === 'CanceledError')) {
        setState('cancelled'); setError('Upload cancelled'); return null;
      }
      // Build a NON-SECRET diagnostics report of the exact client-side failure.
      let httpStatus = '(none)';
      let respBody = '(none)';
      let errName = '(none)';
      let errMsg = '';
      let errCode = '';
      if (axios.isAxiosError(err)) {
        httpStatus = err.response ? String(err.response.status) : '(no response)';
        const data = err.response?.data as { message?: string; error?: string } | string | undefined;
        respBody = typeof data === 'string' ? data : (data?.message || data?.error || '(empty)');
        errName = err.name;
        errMsg = err.message;
        errCode = err.code || '';
      } else if (err instanceof Error) {
        errName = err.name; errMsg = err.message;
      }
      const diag = [
        `Upload target: ${d.uploadUrl}`,
        `API base: ${d.apiBase || '(empty / relative)'}`,
        `Stored base: ${d.storedApiBase || '(none)'}`,
        `Page origin: ${d.origin}`,
        `Session: ${d.sessionPresent ? 'present' : 'MISSING'}`,
        `HTTP status: ${httpStatus}`,
        `Response: ${respBody}`,
        `Error: ${errName}${errCode ? ' [' + errCode + ']' : ''} ${errMsg}`.trim(),
      ];
      setDiagnostics(diag);
      setError(respBody !== '(none)' && respBody !== '(empty)' ? `Upload failed: ${respBody}` : `Upload failed: ${errMsg || errName}`);
      setState('error');
      return null;
    } finally {
      abortRef.current = null;
    }
  }, [roomToken, sessionToken]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => { setState('idle'); setProgress(0); setLoaded(0); setTotal(0); setError(null); setDiagnostics(null); }, []);

  return { state, progress, loaded, total, error, diagnostics, upload, cancel, reset };
};
