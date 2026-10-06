import { useCallback, useEffect, useRef, useState } from 'react';
import {
  heartbeat as apiHeartbeat,
  listParticipants,
  listRoomFiles,
} from '../api/rooms';
import { JoinResponse, ParticipantList, RoomFile } from '../types';

const sessionKey = (roomToken: string) => `qrshare_room_session_${roomToken}`;

/** Reads any persisted session for this room (survives page refresh). */
export const loadSession = (roomToken: string): JoinResponse | null => {
  const raw = localStorage.getItem(sessionKey(roomToken));
  return raw ? (JSON.parse(raw) as JoinResponse) : null;
};

export const saveSession = (roomToken: string, session: JoinResponse) => {
  localStorage.setItem(sessionKey(roomToken), JSON.stringify(session));
};

export const clearSession = (roomToken: string) => {
  localStorage.removeItem(sessionKey(roomToken));
};

const HEARTBEAT_MS = 10_000; // lightweight presence; well under the 30s server timeout
const REFRESH_MS = 5_000;

/**
 * Live room state for a joined participant: periodic heartbeat (presence),
 * participant list, and file list. Intervals are modest (not an aggressive
 * loop). Returns a manual refresh for immediate updates after an upload.
 */
export const useRoomLive = (roomToken: string, sessionToken: string | null) => {
  const [participants, setParticipants] = useState<ParticipantList>({ onlineCount: 0, participants: [] });
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [p, f] = await Promise.all([
        listParticipants(roomToken),
        listRoomFiles(roomToken, sessionToken),
      ]);
      if (!stopped.current) {
        setParticipants(p);
        setFiles(f);
        setError(null);
      }
    } catch (e) {
      if (!stopped.current) {
        setError(e instanceof Error ? e.message : 'Room is no longer available');
      }
    }
  }, [roomToken, sessionToken]);

  useEffect(() => {
    stopped.current = false;
    if (!sessionToken) return;

    refresh();
    const beat = setInterval(() => {
      apiHeartbeat(roomToken, sessionToken).catch(() => {});
    }, HEARTBEAT_MS);
    const poll = setInterval(refresh, REFRESH_MS);

    return () => {
      stopped.current = true;
      clearInterval(beat);
      clearInterval(poll);
    };
  }, [roomToken, sessionToken, refresh]);

  return { participants, files, error, refresh };
};
