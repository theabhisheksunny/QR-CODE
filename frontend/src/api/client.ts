import axios from 'axios';

const getBaseUrl = (): string => {
  const stored = localStorage.getItem('qrshare_api_base_url');
  return stored || '';
};

const client = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Accept': 'application/json',
  },
});

client.interceptors.request.use((config) => {
  const base = localStorage.getItem('qrshare_api_base_url');
  if (base) {
    config.baseURL = base;
  }
  return config;
});

export default client;
