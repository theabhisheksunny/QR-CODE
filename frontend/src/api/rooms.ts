import client from './client';
import {
  CreateRoomResponse,
  RoomInfoResponse,
  JoinResponse,
  ParticipantList,
  RoomFile,
} from '../types';

const SESSION_HEADER = 'X-Room-Session';

/**
 * Builds a NON-SECRET diagnostics snapshot of how a room upload is addressed.
 * Never includes the session token value (only presence). Used to surface the
 * exact upload target + client-side failure to the user.
 */
export const uploadDiagnostics = (roomToken: string, sessionToken: string | null) => {
  const stored = localStorage.getItem('qrshare_api_base_url') || '';
  const apiBase = (client.defaults.baseURL || stored || '').replace(/\/$/, '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const href = typeof window !== 'undefined' ? window.location.href : '';
  const uploadUrl = `${apiBase}/api/rooms/${roomToken}/files`;
  return {
    href,
    origin,
    storedApiBase: stored,
    apiBase,
    uploadUrl,
    sessionPresent: !!sessionToken,
  };
};

export const createRoom = async (name: string, expirationMinutes: number): Promise<CreateRoomResponse> => {
  const res = await client.post<CreateRoomResponse>('/api/rooms', { name, expirationMinutes });
  return res.data;
};

export const getRoomInfo = async (roomToken: string): Promise<RoomInfoResponse> => {
  const res = await client.get<RoomInfoResponse>(`/api/rooms/${roomToken}`);
  return res.data;
};

export const joinRoom = async (roomToken: string, displayName: string): Promise<JoinResponse> => {
  const res = await client.post<JoinResponse>(`/api/rooms/${roomToken}/join`, { displayName });
  return res.data;
};

export const heartbeat = async (roomToken: string, sessionToken: string): Promise<void> => {
  await client.post(`/api/rooms/${roomToken}/heartbeat`, null, {
    headers: { [SESSION_HEADER]: sessionToken },
  });
};

export const listParticipants = async (roomToken: string): Promise<ParticipantList> => {
  const res = await client.get<ParticipantList>(`/api/rooms/${roomToken}/participants`);
  return res.data;
};

export const listRoomFiles = async (roomToken: string, sessionToken: string): Promise<RoomFile[]> => {
  const res = await client.get<RoomFile[]>(`/api/rooms/${roomToken}/files`, {
    headers: { [SESSION_HEADER]: sessionToken },
  });
  return res.data;
};

export const uploadRoomFile = async (
  roomToken: string,
  sessionToken: string,
  file: File,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<RoomFile> => {
  // Browser-native streaming multipart upload (same approach as direct share):
  // FormData references the File, so the browser streams it; no in-JS copy.
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post<RoomFile>(`/api/rooms/${roomToken}/files`, formData, {
    headers: { [SESSION_HEADER]: sessionToken },
    signal,
    timeout: 0,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded * 100) / e.total), e.loaded, e.total);
      }
    },
  });
  return res.data;
};

export const deleteRoomFile = async (roomToken: string, sessionToken: string, fileToken: string): Promise<void> => {
  await client.delete(`/api/rooms/${roomToken}/files/${fileToken}`, {
    headers: { [SESSION_HEADER]: sessionToken },
  });
};

export const closeRoom = async (roomToken: string): Promise<void> => {
  await client.post(`/api/rooms/${roomToken}/close`);
};
