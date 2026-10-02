import { test, expect } from '@playwright/test';
import { uploadFileViaApi, fetchBuffer, apiDelete, API_URL, TEST_FILES_DIR } from './helpers';
import * as path from 'path';
import * as http from 'http';

test.describe('File Delete Test', () => {
  test('06 - upload, verify access, delete, verify 404', async () => {
    const filePath = path.join(TEST_FILES_DIR, 'delete-test.pdf');

    // Upload
    const uploadResult = await uploadFileViaApi(filePath, 30);
    expect(uploadResult.status).toBe(201);
    const data = uploadResult.data;
    console.log(`Uploaded for delete test: id=${data.id}, shareUrl=${data.shareUrl}`);

    // Verify accessible before delete
    const buf = await fetchBuffer(data.shareUrl);
    expect(buf.length).toBeGreaterThan(0);
    console.log('Pre-delete access: PASS');

    // Delete via API
    const deleteResult = await apiDelete(`${API_URL}/api/files/${data.id}`);
    expect(deleteResult.status).toBe(204);
    console.log('Delete: PASS (204 received)');

    // Verify 404/410 after delete
    const tokenMatch = data.shareUrl.match(/\/share\/([^/]+)$/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];

    const checkStatus = await new Promise<number>((resolve) => {
      http.get(`${API_URL}/api/files/share/${token}`, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode || 0));
      }).on('error', () => resolve(0));
    });

    expect([404, 410, 400]).toContain(checkStatus);
    console.log(`Post-delete access returns ${checkStatus}: PASS`);
  });
});
