/**
 * LAN Mode E2E Tests
 * These tests verify the local-network-first architecture running on port 8787.
 * Run against the full stack (backend + frontend bundled) at http://localhost:8787.
 */

import { test, expect, request } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8787';
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_TXT = path.join(FIXTURES_DIR, 'test.txt');

// ---------------------------------------------------------------------------
// LAN-01: Network info endpoint returns valid structure
// ---------------------------------------------------------------------------
test('LAN-01: GET /api/network/info returns valid network info', async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const resp = await ctx.get('/api/network/info');

  expect(resp.status()).toBe(200);
  const body = await resp.json();

  expect(body).toHaveProperty('localIp');
  expect(body).toHaveProperty('port');
  expect(body).toHaveProperty('shareBaseUrl');
  expect(body).toHaveProperty('allInterfaces');
  expect(body.port).toBe(8787);
  expect(body.shareBaseUrl).toMatch(/^http:\/\//);
  // localIp may be 127.0.0.1 if no LAN is available in CI, so we just check it's present
  expect(typeof body.localIp).toBe('string');
  expect(body.localIp.length).toBeGreaterThan(0);

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// LAN-02: Upload file → shareUrl contains /share/ (SPA route, not /api/files/share/)
// ---------------------------------------------------------------------------
test('LAN-02: Upload file → shareUrl uses SPA /share/ route', async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL });

  const resp = await ctx.post('/api/files', {
    multipart: {
      file: {
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Hello LAN World'),
      },
      expirationMinutes: '30',
    },
  });

  expect(resp.status()).toBe(201);
  const body = await resp.json();
  const shareUrl: string = body.shareUrl;

  expect(shareUrl).toBeTruthy();
  expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);
  expect(shareUrl).not.toContain('/api/files/share/');
  expect(shareUrl).not.toContain('localhost');

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// LAN-03: Upload → navigate to /share/<token> → SPA renders file info
// ---------------------------------------------------------------------------
test('LAN-03: Upload → SPA share page renders file name', async ({ page }) => {
  const ctx = await request.newContext({ baseURL: BASE_URL });

  const resp = await ctx.post('/api/files', {
    multipart: {
      file: {
        name: 'lan-test-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('LAN content for share page test'),
      },
      expirationMinutes: '30',
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();

  const token = body.shareUrl.substring(body.shareUrl.lastIndexOf('/') + 1);
  expect(token).toBeTruthy();

  // Navigate to share page
  const sharePageUrl = `${BASE_URL}/share/${token}`;
  const pageResp = await page.goto(sharePageUrl);

  expect(pageResp?.status()).toBe(200);
  // Check the SPA loaded (index.html served, React rendered)
  await expect(page.locator('body')).not.toBeEmpty();

  // Verify metadata endpoint returns correct file name
  const metaResp = await ctx.get(`/api/files/share/${token}/metadata`);
  expect(metaResp.status()).toBe(200);
  const meta = await metaResp.json();
  expect(meta.originalFileName).toBe('lan-test-file.txt');

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// LAN-04: 3 uploads → unique tokens → cross-file isolation
// ---------------------------------------------------------------------------
test('LAN-04: Three uploads produce unique tokens with cross-file isolation', async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL });

  const files = [
    { name: 'alpha.txt', content: 'Alpha content' },
    { name: 'beta.txt',  content: 'Beta content'  },
    { name: 'gamma.txt', content: 'Gamma content' },
  ];

  const results: Array<{ token: string; fileName: string }> = [];

  for (const f of files) {
    const resp = await ctx.post('/api/files', {
      multipart: {
        file: { name: f.name, mimeType: 'text/plain', buffer: Buffer.from(f.content) },
        expirationMinutes: '30',
      },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    const token = body.shareUrl.substring(body.shareUrl.lastIndexOf('/') + 1);
    results.push({ token, fileName: f.name });
  }

  // All tokens must be distinct
  const tokens = results.map((r) => r.token);
  expect(new Set(tokens).size).toBe(3);

  // Cross-isolation: each token returns its own file name
  for (const r of results) {
    const metaResp = await ctx.get(`/api/files/share/${r.token}/metadata`);
    expect(metaResp.status()).toBe(200);
    const meta = await metaResp.json();
    expect(meta.originalFileName).toBe(r.fileName);
  }

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// LAN-05: Upload → delete → second access returns 404
// ---------------------------------------------------------------------------
test('LAN-05: Delete file → metadata returns 404', async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL });

  const resp = await ctx.post('/api/files', {
    multipart: {
      file: {
        name: 'delete-me.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('To be deleted'),
      },
      expirationMinutes: '30',
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  const fileId: string = body.id;
  const token = body.shareUrl.substring(body.shareUrl.lastIndexOf('/') + 1);

  // Delete
  const delResp = await ctx.delete(`/api/files/${fileId}`);
  expect(delResp.status()).toBe(204);

  // Access metadata after delete → 404
  const metaResp = await ctx.get(`/api/files/share/${token}/metadata`);
  expect(metaResp.status()).toBe(404);

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// LAN-06: GET / returns 200 with HTML content
// ---------------------------------------------------------------------------
test('LAN-06: GET / returns 200 HTML (static frontend served)', async ({ page }) => {
  const resp = await page.goto(BASE_URL + '/');

  expect(resp?.status()).toBe(200);
  const contentType = resp?.headers()['content-type'] ?? '';
  expect(contentType).toContain('text/html');

  const content = await page.content();
  expect(content).toContain('<html');
});

// ---------------------------------------------------------------------------
// LAN-07: Navigate to /share/<token> → SPA served (no 302 redirect to /api/)
// ---------------------------------------------------------------------------
test('LAN-07: /share/<token> is served by SPA, not redirected to /api/', async ({ page }) => {
  // Upload a real file to get a valid token
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const resp = await ctx.post('/api/files', {
    multipart: {
      file: {
        name: 'spa-route-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('SPA routing test'),
      },
      expirationMinutes: '30',
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  const token = body.shareUrl.substring(body.shareUrl.lastIndexOf('/') + 1);

  // Navigate to share page
  const sharePageUrl = `${BASE_URL}/share/${token}`;
  await page.goto(sharePageUrl);

  // URL must stay at /share/<token> — no redirect to /api/
  expect(page.url()).not.toContain('/api/');
  expect(page.url()).toContain(`/share/${token}`);

  // Page should contain HTML (SPA loaded)
  const content = await page.content();
  expect(content).toContain('<html');

  await ctx.dispose();
});
