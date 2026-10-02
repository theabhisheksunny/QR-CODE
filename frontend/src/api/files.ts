import client from './client';
import { FileUploadResponse, FileMetadataResponse } from '../types';

export const uploadFile = async (
  file: File,
  expirationMinutes: number,
  onProgress?: (percent: number) => void
): Promise<FileUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post<FileUploadResponse>(
    `/api/files?expirationMinutes=${expirationMinutes}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
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
