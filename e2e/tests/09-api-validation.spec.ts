import { test, expect } from '@playwright/test';
import { apiGet, apiPost, apiDelete, API_URL } from './helpers';

test.describe('API Validation', () => {
  test('09 - POST /api/qr/value with empty string returns 400', async () => {
    const r = await apiPost(`${API_URL}/api/qr/value`, { value: '' });
    expect(r.status).toBe(400);
  });

  test('09 - GET /api/files/share/nonexistent returns 404', async () => {
    const r = await apiGet(`${API_URL}/api/files/share/this-token-does-not-exist`);
    expect([404, 400]).toContain(r.status);
  });

  test('09 - DELETE /api/files/zero-UUID returns 404', async () => {
    const r = await apiDelete(`${API_URL}/api/files/00000000-0000-0000-0000-000000000000`);
    expect([404, 400]).toContain(r.status);
  });

  test('09 - actuator health returns UP', async () => {
    const r = await apiGet(`${API_URL}/actuator/health`);
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('UP');
  });

  test('09 - API docs available', async () => {
    const r = await apiGet(`${API_URL}/v3/api-docs`);
    expect(r.status).toBe(200);
  });
});
