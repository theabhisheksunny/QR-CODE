import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
export const API_URL = process.env.API_URL || 'http://localhost:8787';
export const TEST_FILES_DIR = path.join(__dirname, '../../test-files');

export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function apiPost(url: string, body: object): Promise<{ status: number; data: any }> {
  const https_mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = https_mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 0, data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

export async function apiGet(url: string): Promise<{ status: number; data: any }> {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 0, data }); }
      });
    }).on('error', reject);
  });
}

export async function apiDelete(url: string): Promise<{ status: number }> {
  const urlObj = new URL(url);
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'DELETE'
    };
    const req = (client as any).request(options, (res: any) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ status: res.statusCode || 0 }));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function uploadFileViaApi(
  filePath: string,
  expirationMinutes: number = 30
): Promise<{ status: number; data: any }> {
  const FormData = (await import('form-data' as any)).default;
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), path.basename(filePath));
  formData.append('expirationMinutes', String(expirationMinutes));

  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${API_URL}/api/files`);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: formData.getHeaders()
    };
    const client = API_URL.startsWith('https') ? https : http;
    const req = (client as any).request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 0, data }); }
      });
    });
    req.on('error', reject);
    formData.pipe(req);
  });
}
