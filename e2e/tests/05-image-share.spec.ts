import { test, expect } from '@playwright/test';
import { uploadFileViaApi, fetchBuffer, hashFile, hashBuffer, TEST_FILES_DIR } from './helpers';
import * as path from 'path';

test.describe('Image File Share', () => {
  for (const imgFile of ['test-image.png', 'test-image.jpg']) {
    test(`05 - upload ${imgFile} and verify hash match`, async () => {
      const filePath = path.join(TEST_FILES_DIR, imgFile);
      const originalHash = hashFile(filePath);

      const uploadResult = await uploadFileViaApi(filePath, 30);
      expect(uploadResult.status).toBe(201);

      const data = uploadResult.data;
      expect(data.originalFileName).toBe(imgFile);
      expect(data.contentType).toMatch(/image/);
      expect(data.shareUrl).toMatch(/\/share\//);
      expect(data.fileSize).toBeGreaterThan(0);

      // Verify token is a random string, not a sequential ID
      const tokenMatch = data.shareUrl.match(/\/share\/([^/]+)$/);
      expect(tokenMatch).toBeTruthy();
      const token = tokenMatch![1];
      expect(token.length).toBeGreaterThan(15);

      const downloadedBuf = await fetchBuffer(data.shareUrl);
      expect(downloadedBuf.length).toBe(data.fileSize);
      const downloadedHash = hashBuffer(downloadedBuf);

      console.log(`${imgFile} hash: original=${originalHash.substring(0, 16)}, downloaded=${downloadedHash.substring(0, 16)}`);
      expect(downloadedHash).toBe(originalHash);
      console.log(`${imgFile} hash match: PASS`);
    });
  }
});
