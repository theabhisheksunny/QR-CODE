import { test, expect, BrowserContext } from '@playwright/test';
import { uploadFileViaApi, fetchBuffer, hashFile, hashBuffer, apiGet, API_URL, TEST_FILES_DIR } from './helpers';
import * as path from 'path';
import * as fs from 'fs';

test.describe('File Upload and Device B Access', () => {
  test('03 - upload test-small.txt and verify via Device B', async ({ browser }) => {
    const filePath = path.join(TEST_FILES_DIR, 'test-small.txt');
    const originalHash = hashFile(filePath);

    // Device A: Upload via API
    const uploadResult = await uploadFileViaApi(filePath, 30);
    expect(uploadResult.status).toBe(201);

    const data = uploadResult.data;
    expect(data.originalFileName).toBe('test-small.txt');
    expect(data.shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);
    expect(data.shareUrl).not.toContain('/api/files/share/');
    expect(data.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(data.expiresAt).toBeTruthy();
    expect(data.fileSize).toBeGreaterThan(0);
    expect(data.id).toBeTruthy();

    // Verify token is NOT a sequential ID (must be long random string)
    const tokenMatch = data.shareUrl.match(/\/share\/([^/]+)$/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];
    expect(token.length).toBeGreaterThan(15);
    expect(['1', '2', '3', '4', '5']).not.toContain(token);

    console.log(`Uploaded: shareUrl=${data.shareUrl}, token length=${token.length}`);

    // Device B: Download file via the backend download endpoint
    const downloadedBuf = await fetchBuffer(`${API_URL}/api/files/share/${token}`);
    expect(downloadedBuf.length).toBeGreaterThan(0);
    const downloadedHash = hashBuffer(downloadedBuf);

    expect(downloadedHash).toBe(originalHash);
    console.log(`Hash match: original=${originalHash.substring(0, 16)}... downloaded=${downloadedHash.substring(0, 16)}...`);

    // Device B: Metadata endpoint
    const metaResult = await apiGet(`${API_URL}/api/files/share/${token}/metadata`);
    expect(metaResult.status).toBe(200);
    expect(metaResult.data.originalFileName).toBe('test-small.txt');
    expect(metaResult.data.fileSize).toBe(data.fileSize);

    // Device B: Browser context test
    const FRONTEND_URL = process.env.BASE_URL || 'http://localhost:5173';

    const deviceBContext: BrowserContext = await browser.newContext();
    const deviceBPage = await deviceBContext.newPage();

    // The share URL points to the backend API directly.
    // The frontend may have a /share/:token route.
    // Try the frontend route first, then fall back to direct API URL.
    const frontendShareUrl = `${FRONTEND_URL}/share/${token}`;
    const response = await deviceBPage.goto(frontendShareUrl);
    if (!response || response.status() >= 400) {
      await deviceBPage.goto(data.shareUrl);
    }

    await deviceBPage.waitForLoadState('networkidle');
    const pageContent = await deviceBPage.locator('body').textContent();
    // Should show file name OR download link
    const hasFileName = pageContent?.includes('test-small') ||
      pageContent?.toLowerCase().includes('download') ||
      pageContent?.toLowerCase().includes('file');
    expect(hasFileName).toBeTruthy();

    // Ensure test-results dir exists
    const resultsDir = path.join(__dirname, '../test-results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    await deviceBPage.screenshot({ path: path.join(resultsDir, '03-file-upload-device-b.png'), fullPage: true });
    await deviceBContext.close();
  });

  test('03 - upload screenshot: Device A file upload UI', async ({ page }) => {
    const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Try to click the File tab/button
    const fileTab = page.locator('button, a, [role="tab"]').filter({ hasText: /file/i }).first();
    if (await fileTab.count() > 0) {
      await fileTab.click();
      await page.waitForTimeout(500);
    }

    // Ensure test-results dir exists
    const resultsDir = path.join(__dirname, '../test-results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    await page.screenshot({ path: path.join(resultsDir, '02-small-file-upload.png'), fullPage: true });
  });
});
