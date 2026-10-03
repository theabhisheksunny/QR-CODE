import { test, expect } from '@playwright/test';
import { uploadFileViaApi, fetchBuffer, hashFile, hashBuffer, downloadUrlFromShareUrl, TEST_FILES_DIR } from './helpers';
import * as path from 'path';

test.describe('Concurrent Uploads and Cross-Isolation', () => {
  test('08 - concurrent uploads produce unique tokens with correct file isolation', async () => {
    const files = [
      { name: 'test-small.txt', filePath: path.join(TEST_FILES_DIR, 'test-small.txt') },
      { name: 'test-image.jpg', filePath: path.join(TEST_FILES_DIR, 'test-image.jpg') },
      { name: 'test-data.json', filePath: path.join(TEST_FILES_DIR, 'test-data.json') },
    ];

    // Upload all 3 concurrently
    const uploadResults = await Promise.all(files.map(f => uploadFileViaApi(f.filePath, 30)));

    for (const result of uploadResults) {
      expect(result.status).toBe(201);
    }

    const tokens = uploadResults.map(r => {
      const m = r.data.shareUrl.match(/\/share\/([^/]+)$/);
      return m ? m[1] : '';
    });

    console.log('Concurrent tokens:', tokens);

    // All tokens must be unique
    expect(new Set(tokens).size).toBe(3);

    // Each token must point to its own file (hash comparison)
    for (let i = 0; i < files.length; i++) {
      const originalHash = hashFile(files[i].filePath);
      const downloadedBuf = await fetchBuffer(downloadUrlFromShareUrl(uploadResults[i].data.shareUrl));
      const downloadedHash = hashBuffer(downloadedBuf);
      expect(downloadedHash).toBe(originalHash);
      console.log(`File ${files[i].name} isolation: PASS`);
    }

    // Cross-isolation: token B must NOT return file A
    const fileA_hash = hashFile(files[0].filePath);
    const fileFromTokenB = await fetchBuffer(downloadUrlFromShareUrl(uploadResults[1].data.shareUrl));
    const tokenB_hash = hashBuffer(fileFromTokenB);
    expect(tokenB_hash).not.toBe(fileA_hash);
    console.log('Cross-isolation (token B does not return file A): PASS');
  });
});
