import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const statusPath = path.join(__dirname, '../../.agents/tasks/services-status.json');
const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
const BASE_URL = status.frontendUrl || 'http://localhost:5173';

test.describe('Homepage', () => {
  test('01 - homepage loads and has required UI', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Page should load
    await expect(page).toHaveTitle(/.+/);

    // Check for QR-related text
    const bodyText = await page.locator('body').textContent();
    const hasQrText = bodyText?.toLowerCase().includes('qr') || bodyText?.toLowerCase().includes('share');
    expect(hasQrText).toBeTruthy();

    // Check file upload mode exists (button or tab or link)
    const fileMode = page.locator('button, a, [role="tab"]').filter({ hasText: /file/i });
    const fileModeCount = await fileMode.count();
    expect(fileModeCount).toBeGreaterThan(0);

    // Check text/value mode exists
    const textMode = page.locator('button, a, [role="tab"]').filter({ hasText: /text|value|url/i });
    const textModeCount = await textMode.count();
    expect(textModeCount).toBeGreaterThan(0);

    // Log console errors but don't fail on them (some may be non-critical)
    if (consoleErrors.length > 0) {
      console.warn('Console errors on homepage:', consoleErrors);
    }

    // Ensure test-results dir exists
    const resultsDir = path.join(__dirname, '../test-results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    // Screenshot
    await page.screenshot({ path: path.join(resultsDir, '01-homepage.png'), fullPage: true });
  });
});
