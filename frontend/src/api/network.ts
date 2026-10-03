import client from './client';
import { NetworkInfo, NetworkInterfaceInfo } from '../types';

export const getNetworkInfo = async (): Promise<NetworkInfo> => {
  const response = await client.get<NetworkInfo>('/api/network/info');
  return response.data;
};

export const getNetworkInterfaces = async (): Promise<NetworkInterfaceInfo[]> => {
  const response = await client.get<NetworkInterfaceInfo[]>('/api/network/interfaces');
  return response.data;
};

export const selectNetworkInterface = async (ipAddress: string): Promise<NetworkInfo> => {
  const response = await client.post<NetworkInfo>('/api/network/select', { ipAddress });
  return response.data;
};
