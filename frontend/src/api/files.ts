import client from './client';
import { FileUploadResponse, FileMetadataResponse } from '../types';

export const uploadFile = async (
  file: File,
  expirationMinutes: number,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<FileUploadResponse> => {
  // Browser-native streaming multipart upload: FormData wraps the File object by
  // reference, so the browser streams it from disk in chunks over the wire. The
  // whole file is never read into JS memory (no arrayBuffer()/Base64), so memory
  // stays flat for multi-GB files.
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post<FileUploadResponse>(
    `/api/files?expirationMinutes=${expirationMinutes}`,
    formData,
    {
      // Let the browser set the multipart boundary; forcing the header breaks it.
      signal,
      // No client-side timeout: multi-GB uploads can take minutes.
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent, progressEvent.loaded, progressEvent.total);
        }
      },
    }
  );
  return response.data;
};

export const getFileMetadata = async (id: string): Promise<FileMetadataResponse> => {
  const response = await client.get<FileMetadataResponse>(`/api/files/${id}`);
  return response.data;
};

export const deleteFile = async (id: string): Promise<void> => {
  await client.delete(`/api/files/${id}`);
};

export const getShareMetadata = async (token: string): Promise<FileMetadataResponse> => {
  const response = await client.get<FileMetadataResponse>(`/api/files/share/${token}/metadata`);
  return response.data;
};
