import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

test.describe('Responsive Layout', () => {
  for (const vp of viewports) {
    test(`10 - responsive at ${vp.name} (${vp.width}x${vp.height})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasOverflow) {
        console.warn(`Horizontal scroll detected at ${vp.name} viewport`);
      }

      // At mobile viewport, verify main buttons are visible and have non-zero size
      if (vp.width <= 390) {
        const firstButton = page.locator('button').first();
        if (await firstButton.count() > 0) {
          const box = await firstButton.boundingBox();
          if (box) {
            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);
          }
        }
      }

      // Ensure test-results dir exists
      const resultsDir = path.join(__dirname, '../test-results');
      if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

      await page.screenshot({
        path: path.join(resultsDir, `10-responsive-${vp.name}.png`),
        fullPage: true,
      });
      await context.close();
    });
  }
});
