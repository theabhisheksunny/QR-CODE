import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { createRoom } from '../api/rooms';
import { saveSession } from '../hooks/useRoom';
import { joinRoom } from '../api/rooms';
import { isNoApiBaseError } from '../api/client';

const EXPIRY_OPTIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 },
];

export const RoomCreatePage = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(120);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const room = await createRoom(name || 'Local Sharing Room', minutes);
      // The host auto-joins so they can upload/download too.
      const session = await joinRoom(room.roomToken, 'Host');
      saveSession(room.roomToken, session);
      toast.success('Room created');
      navigate(`/room/${room.roomToken}`);
    } catch (e) {
      if (isNoApiBaseError(e)) {
        toast.error('Connect to a host first: open Settings and set the host address, or scan a Room/Share QR.');
      } else {
        toast.error('Could not create room');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-indigo-500" /> Create Local Sharing Room
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Host a room on this device. Others join from a browser by scanning the room QR — no app required.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Room Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Family Trip"
            maxLength={60}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-gray-900 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Expiration</span>
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-gray-900 dark:text-white"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.minutes} value={o.minutes}>{o.label}</option>
            ))}
          </select>
        </label>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          {busy ? 'Creating…' : 'Create Room'}
        </button>
      </div>
    </div>
  );
};
