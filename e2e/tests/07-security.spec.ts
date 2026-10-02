import { test, expect } from '@playwright/test';
import { uploadFileViaApi, apiGet, apiPost, apiDelete, API_URL, TEST_FILES_DIR } from './helpers';
import * as path from 'path';
import * as http from 'http';

test.describe('Security Tests', () => {
  test('07 - invalid token returns 404', async () => {
    const result = await apiGet(`${API_URL}/api/files/share/invalid-token-xyz-123456`);
    expect([404, 400]).toContain(result.status);
  });

  test('07 - modified token returns 404', async () => {
    const filePath = path.join(TEST_FILES_DIR, 'test-small.txt');
    const upload = await uploadFileViaApi(filePath, 30);
    expect(upload.status).toBe(201);
    const tokenMatch = upload.data.shareUrl.match(/\/share\/([^/]+)$/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];

    // Flip the last character to produce an invalid token
    const lastChar = token[token.length - 1];
    const newChar = lastChar === 'a' ? 'b' : 'a';
    const modifiedToken = token.slice(0, -1) + newChar;

    const result = await apiGet(`${API_URL}/api/files/share/${modifiedToken}`);
    expect([404, 400]).toContain(result.status);
    console.log(`Modified token returns ${result.status}: PASS`);
  });

  test('07 - tokens are non-sequential random strings', async () => {
    const filePath = path.join(TEST_FILES_DIR, 'test-small.txt');
    const tokens: string[] = [];

    for (let i = 0; i < 3; i++) {
      const upload = await uploadFileViaApi(filePath, 30);
      expect(upload.status).toBe(201);
      const tokenMatch = upload.data.shareUrl.match(/\/share\/([^/]+)$/);
      expect(tokenMatch).toBeTruthy();
      tokens.push(tokenMatch![1]);
    }
    console.log('Tokens:', tokens);

    // All tokens must be unique
    expect(new Set(tokens).size).toBe(3);

    // All tokens must be long (not a simple integer like 1/2/3)
    for (const t of tokens) {
      expect(t.length).toBeGreaterThan(15);
      expect(['1', '2', '3']).not.toContain(t);
    }
    console.log('Token uniqueness and length: PASS');
  });

  test('07 - non-existent UUID returns 404', async () => {
    const result = await apiGet(`${API_URL}/api/files/00000000-0000-0000-0000-000000000000`);
    expect([404, 400]).toContain(result.status);
  });

  test('07 - blank QR value returns 400', async () => {
    const result = await apiPost(`${API_URL}/api/qr/value`, { value: '' });
    expect(result.status).toBe(400);
  });

  test('07 - upload without file returns 400 or 500', async () => {
    const statusCode = await new Promise<number>((resolve) => {
      const boundary = 'boundary123';
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="expirationMinutes"\r\n\r\n30\r\n--${boundary}--\r\n`;
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: 8080,
        path: '/api/files',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = http.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode || 0));
      });
      req.on('error', () => resolve(0));
      req.write(body);
      req.end();
    });
    expect([400, 500]).toContain(statusCode);
    console.log(`Upload without file returns: ${statusCode}`);
  });
});
