import { describe, expect, it } from 'vitest';
import { apiRequestUrl } from './api-url';

describe('environment API routing', () => {
  it('keeps development requests on the local Vite API proxy', () => {
    expect(apiRequestUrl('/api/auth/session', '', true)).toBe('/api/auth/session');
  });
  it('uses the configured staging endpoint without duplicating /api', () => {
    expect(apiRequestUrl('/api/save-index?offset=20', 'https://staging.example.invalid/api/', false))
      .toBe('https://staging.example.invalid/api/save-index?offset=20');
  });
  it('rejects API calls in a disconnected deployed preview', () => {
    expect(() => apiRequestUrl('/api/auth/session', '', false)).toThrow('API_BASE_URL_NOT_CONFIGURED');
  });
  it('does not route provider or arbitrary URLs through the game backend', () => {
    expect(() => apiRequestUrl('https://provider.example/api', '', true)).toThrow('INVALID_API_PATH');
    expect(() => apiRequestUrl('/api-other', '', true)).toThrow('INVALID_API_PATH');
  });
});
