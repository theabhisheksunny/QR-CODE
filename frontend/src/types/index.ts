export interface QrValueResponse {
  type: string;
  value: string;
  qrCode: string;
}

export interface FileUploadResponse {
  id: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  shareUrl: string;
  qrCode: string;
  createdAt: string;
  expiresAt: string;
  downloadCount: number;
}

export interface FileMetadataResponse {
  id: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  shareUrl: string;
  createdAt: string;
  expiresAt: string;
  downloadCount: number;
}

export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  message: string;
}

export interface QrHistoryEntry {
  id: string;
  type: 'text' | 'file';
  label: string;
  value?: string;
  qrCode: string;
  createdAt: string;
  fileId?: string;
  shareUrl?: string;
  expiresAt?: string;
}

export type ExpirationOption = {
  label: string;
  minutes: number;
};

export interface NetworkInterfaceInfo {
  name: string;
  displayName: string;
  ipAddress: string;
  preferred: boolean;
}

export interface NetworkInfo {
  localIp: string;
  port: number;
  shareBaseUrl: string;
  allInterfaces: NetworkInterfaceInfo[];
}
