import { test, expect } from '@playwright/test';
import { uploadFileViaApi, fetchBuffer, hashFile, hashBuffer, downloadUrlFromShareUrl, TEST_FILES_DIR } from './helpers';
import * as path from 'path';

test.describe('PDF File Share', () => {
  test('04 - upload PDF and verify hash match', async () => {
    const filePath = path.join(TEST_FILES_DIR, 'test-document.pdf');
    const originalHash = hashFile(filePath);
    console.log(`Original PDF hash: ${originalHash}`);

    const uploadResult = await uploadFileViaApi(filePath, 30);
    expect(uploadResult.status).toBe(201);

    const data = uploadResult.data;
    expect(data.originalFileName).toBe('test-document.pdf');
    expect(data.contentType).toContain('pdf');
    expect(data.fileSize).toBeGreaterThan(0);
    expect(data.shareUrl).toMatch(/\/share\//);

    // Verify token structure
    const tokenMatch = data.shareUrl.match(/\/share\/([^/]+)$/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];
    expect(token.length).toBeGreaterThan(15);

    // Download from the API file-streaming endpoint and compare
    const downloadedBuf = await fetchBuffer(downloadUrlFromShareUrl(data.shareUrl));
    const downloadedHash = hashBuffer(downloadedBuf);

    console.log(`Downloaded PDF hash: ${downloadedHash}`);
    expect(downloadedHash).toBe(originalHash);
    console.log('PDF hash match: PASS');
  });
});
