import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Upload, LogIn, DoorClosed } from 'lucide-react';
import toast from 'react-hot-toast';
import { QrDisplay } from '../components/QrDisplay';
import { ParticipantList } from '../components/ParticipantList';
import { RoomFileList } from '../components/RoomFileList';
import { UploadProgress } from '../components/UploadProgress';
import { FileUploadZone } from '../components/FileUploadZone';
import { useRoomLive, loadSession, saveSession, clearSession } from '../hooks/useRoom';
import { useRoomUpload } from '../hooks/useRoomUpload';
import { getRoomInfo, joinRoom, closeRoom } from '../api/rooms';
import { generateTextQr } from '../api/qr';
import { establishFromCurrentUrl } from '../services/apiBase';
import { JoinResponse, RoomInfoResponse } from '../types';

export const RoomPage = () => {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<RoomInfoResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<JoinResponse | null>(() => loadSession(token));
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinDiag, setJoinDiag] = useState<string[] | null>(null);
  const [roomQr, setRoomQr] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Two-step in-app Close Room confirmation. We cannot use window.confirm()
  // because the Windows JavaFX WebView has no confirm handler (it returns false),
  // which silently cancelled the close. This state-driven confirm works in every
  // host (web, Windows WebView, Android).
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const { participants, files, error: liveError, refresh } = useRoomLive(token, session?.sessionToken ?? null);
  const { state, progress, loaded, total, error: uploadError, diagnostics, upload, cancel, reset } = useRoomUpload(token, session?.sessionToken ?? null);

  // Load public room info for the header / join screen.
  useEffect(() => {
    // Authoritative host rule: the host of THIS /room/<token> URL owns the API
    // base (web/desktop). This replaces any stale qrshare_api_base_url from a
    // previous room/share so uploads target the correct Device A.
    establishFromCurrentUrl();
    let active = true;
    getRoomInfo(token)
      .then((i) => { if (active) setInfo(i); })
      .catch((e) => { if (active) setLoadError(e?.response?.data?.message || 'Room not available'); });
    return () => { active = false; };
  }, [token]);

  // Generate the room QR from the backend's AUTHORITATIVE LAN URL
  // (http://<Device-A-LAN-IP>:<port>/room/<token>), NOT window.location.href —
  // on the Windows EXE the page origin is loopback (localhost), which a phone
  // could never reach. The backend resolves the real LAN IP via NetworkService.
  const [roomUrl, setRoomUrl] = useState<string>('');
  useEffect(() => {
    if (!info?.roomUrl) return;
    setRoomUrl(info.roomUrl);
    generateTextQr(info.roomUrl)
      .then((r) => setRoomQr(r.qrCode))
      .catch(() => setRoomQr(null));
  }, [info?.roomUrl]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const s = await joinRoom(token, displayName || 'Guest');
      saveSession(token, s);
      setSession(s);
      setJoinDiag(null);
      toast.success('Joined room');
    } catch (e) {
      // Build a non-secret join diagnostics report.
      const base = (localStorage.getItem('qrshare_api_base_url') || '').replace(/\/$/, '');
      let httpStatus = '(no response)';
      let body = '(none)';
      let errName = '';
      let errMsg = '';
      let errCode = '';
      const ax = e as { isAxiosError?: boolean; response?: { status?: number; data?: unknown }; name?: string; message?: string; code?: string };
      if (ax?.response) {
        httpStatus = String(ax.response.status);
        const d = ax.response.data as { message?: string } | string | undefined;
        body = typeof d === 'string' ? d : (d?.message || '(empty)');
      }
      errName = ax?.name || ''; errMsg = ax?.message || ''; errCode = ax?.code || '';
      setJoinDiag([
        `Room URL: ${roomUrl || '(loading)'}`,
        `Resolved API base: ${base || '(empty / relative)'}`,
        `Page origin: ${window.location.origin}`,
        `Join endpoint: POST ${base}/api/rooms/${token.slice(0, 4)}…/join`,
        `HTTP status: ${httpStatus}`,
        `Response: ${body}`,
        `Error: ${errName}${errCode ? ' [' + errCode + ']' : ''} ${errMsg}`.trim(),
      ]);
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Could not join');
    } finally {
      setJoining(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) { toast.error('Select a file'); return; }
    const rf = await upload(selectedFile);
    if (rf) {
      toast.success('Shared with the room');
      setSelectedFile(null);
      reset();
      refresh();
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await closeRoom(token);
      clearSession(token);
      toast.success('Room closed');
      window.location.href = '/';
    } catch {
      toast.error('Could not close room');
      setClosing(false);
      setConfirmingClose(false);
    }
  };

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Room unavailable</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{loadError}</p>
      </div>
    );
  }

  if (!info) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;
  }

  // --- JOIN SCREEN (no session yet) ---
  if (!session) {
    return (
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{info.name}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Join this local sharing room</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Your name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Rahul"
              maxLength={40}
              className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-gray-900 dark:text-white"
            />
          </label>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl"
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {joining ? 'Joining…' : 'Join Room'}
          </button>
          {joinDiag && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
              <p className="font-medium">Could not join the room.</p>
              <details className="mt-2" open>
                <summary className="cursor-pointer text-xs text-red-600 dark:text-red-400">Room join diagnostics</summary>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-all">{joinDiag.join('\n')}</pre>
              </details>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- ROOM VIEW (joined) ---
  const uploading = state === 'uploading';
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{info.name}</h1>
          <p className="text-sm text-green-600 dark:text-green-400">🟢 Connected as {session.displayName}</p>
        </div>
        <div>
          {!confirmingClose ? (
            <button
              onClick={() => setConfirmingClose(true)}
              className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              <DoorClosed className="w-4 h-4" /> Close Room
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400">Close room and remove files?</span>
              <button
                onClick={handleClose}
                disabled={closing}
                className="px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg"
              >
                {closing ? 'Closing…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingClose(false)}
                disabled={closing}
                className="px-2.5 py-1 text-xs font-medium bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {liveError && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-4 py-2 text-sm">
          {liveError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-5 flex flex-col items-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Scan to Join</p>
          {roomQr && <QrDisplay qrCode={roomQr} value={roomUrl} label="Room" copyLabel="Copy Room Link" />}
          <p className="text-xs text-gray-400 break-all mt-2 text-center">{roomUrl}</p>
        </div>
        <ParticipantList participants={participants.participants} onlineCount={participants.onlineCount} />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Upload className="w-4 h-4 text-indigo-500" /> Upload a file
        </h3>
        <FileUploadZone onFileSelect={setSelectedFile} selectedFile={selectedFile} disabled={uploading} />
        {uploading && <UploadProgress progress={progress} loaded={loaded} total={total} onCancel={cancel} />}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading…' : 'Share with Everyone'}
        </button>
        {state === 'error' && uploadError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
            <p className="font-medium">{uploadError}</p>
            {diagnostics && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-red-600 dark:text-red-400">Upload diagnostics</summary>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-all text-red-800 dark:text-red-300">{diagnostics.join('\n')}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Shared Files</h3>
        <RoomFileList roomToken={token} files={files} />
      </div>
    </div>
  );
};
