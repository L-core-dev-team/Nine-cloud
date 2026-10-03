import { describe, expect, it } from 'vitest';
import { clientIp } from './auth.js';

function request(remote: string, forwarded?: string) {
  return {
    env: { server: { incoming: { socket: { remoteAddress: remote } } } },
    req: { header: (name: string) => name === 'x-forwarded-for' ? forwarded : undefined },
  };
}

describe('verification-code client identity', () => {
  it('ignores a client supplied forwarding header on direct connections', () => {
    expect(clientIp(request('203.0.113.8', '198.51.100.2'), [])).toBe('203.0.113.8');
  });
  it('accepts the proxy appended address only from a configured proxy socket', () => {
    expect(clientIp(request('127.0.0.1', '192.0.2.40, 198.51.100.2'), ['127.0.0.1'])).toBe('198.51.100.2');
    expect(clientIp(request('127.0.0.1', 'not-an-address'), ['127.0.0.1'])).toBe('127.0.0.1');
  });
});
