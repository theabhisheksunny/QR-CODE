import { test, expect } from '@playwright/test';
import { apiPost, API_URL } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Text/Value QR Generation', () => {
  const testCases = [
    { name: 'plain text', value: 'Hello World - Universal QR Test' },
    { name: 'integer', value: '123456789' },
    { name: 'decimal', value: '123456.789' },
    { name: 'URL', value: 'https://example.com' },
    { name: 'JSON', value: '{"name":"QR Test","id":12345,"active":true}' },
  ];

  for (const tc of testCases) {
    test(`02 - QR generation: ${tc.name}`, async ({ page }) => {
      const result = await apiPost(`${API_URL}/api/qr/value`, { value: tc.value });
      expect(result.status).toBe(200);
      expect(result.data.value).toBe(tc.value);
      expect(result.data.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(result.data.qrCode.length).toBeGreaterThan(100);
      expect(result.data.type).toBeTruthy();
      console.log(`QR generated for "${tc.name}": type=${result.data.type}, qrCode length=${result.data.qrCode.length}`);
    });
  }

  test('02 - API rejects blank value with 400', async () => {
    const result = await apiPost(`${API_URL}/api/qr/value`, { value: '' });
    expect(result.status).toBe(400);
  });

  test('02 - UI: text QR page loads and generates QR', async ({ page }) => {
    const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Find and click the text/value mode tab or button
    const textModeSelector = page.locator('button, a, [role="tab"]').filter({ hasText: /text|value/i }).first();
    if (await textModeSelector.count() > 0) {
      await textModeSelector.click();
      await page.waitForTimeout(500);
    }

    // Find an input field and type in it
    const input = page.locator('input[type="text"], textarea, input:not([type])').first();
    await input.fill('Hello World - Universal QR Test');

    // Find and click Generate button
    const generateBtn = page.locator('button').filter({ hasText: /generate/i }).first();
    await generateBtn.click();

    // Wait for QR image to appear
    await page.waitForSelector('img[src^="data:image/png;base64"]', { timeout: 15000 });
    const qrImg = page.locator('img[src^="data:image/png;base64"]').first();
    await expect(qrImg).toBeVisible();

    // Ensure test-results dir exists
    const resultsDir = path.join(__dirname, '../test-results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    await page.screenshot({ path: path.join(resultsDir, '02-text-qr.png'), fullPage: true });
  });
});
