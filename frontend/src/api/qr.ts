import client from './client';
import { QrValueResponse } from '../types';

export const generateTextQr = async (value: string): Promise<QrValueResponse> => {
  const response = await client.post<QrValueResponse>('/api/qr/value', { value });
  return response.data;
};
