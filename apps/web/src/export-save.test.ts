import { describe, expect, it } from 'vitest';
import { serializeJsonWithCredentialRedaction, serializeSaveForExport } from './export-save.js';
import type { LocalSave } from './storage.js';

const REDACTED = '[已移除密钥]';

describe('save export credential redaction', () => {
  it('redacts normalized API credentials recursively while preserving unrelated data', () => {
    const source = {
      provider: {
        API_KEY: 'key-one',
        deepseek_api_token: 'key-two',
        service_password: 'service-password',
        provider_secret: 'provider-secret',
        google_token: 'google-token',
        'x-authorization': 'bearer-private',
        baseUrl: 'https://user-name:password-value@api.example.test/v1/chat?key=query-key&region=cn&api_token=query-token',
        refreshToken: 'refresh-three',
        access_token: 'access-four',
        apiSecret: 'secret-five',
        client_secret: 'secret-six',
        nested: { secretAccessKey: 'secret-seven', private_key: 'key-eight', token: 'token-nine' },
      },
      history: { tokenCount: 37, text: '山门外传来清越的铃声。' },
    };

    const serialized = serializeJsonWithCredentialRedaction(source);
    const output = JSON.parse(serialized);

    for (const secret of [
      'key-one', 'key-two', 'service-password', 'provider-secret', 'google-token', 'bearer-private',
      'user-name', 'password-value', 'query-key', 'query-token',
      'refresh-three', 'access-four', 'secret-five', 'secret-six', 'secret-seven', 'key-eight', 'token-nine',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(output.provider.API_KEY).toBe(REDACTED);
    expect(output.provider.deepseek_api_token).toBe(REDACTED);
    expect(output.provider.service_password).toBe(REDACTED);
    expect(output.provider.provider_secret).toBe(REDACTED);
    expect(output.provider.google_token).toBe(REDACTED);
    expect(output.provider['x-authorization']).toBe(REDACTED);
    const endpoint = new URL(output.provider.baseUrl);
    expect(endpoint.username).toBe('REDACTED');
    expect(endpoint.password).toBe('REDACTED');
    expect(endpoint.searchParams.get('key')).toBe(REDACTED);
    expect(endpoint.searchParams.get('api_token')).toBe(REDACTED);
    expect(endpoint.searchParams.get('region')).toBe('cn');
    expect(source.provider.baseUrl).toBe('https://user-name:password-value@api.example.test/v1/chat?key=query-key&region=cn&api_token=query-token');
    expect(output.provider.refreshToken).toBe(REDACTED);
    expect(output.provider.access_token).toBe(REDACTED);
    expect(output.provider.apiSecret).toBe(REDACTED);
    expect(output.provider.client_secret).toBe(REDACTED);
    expect(output.provider.nested.secretAccessKey).toBe(REDACTED);
    expect(output.provider.nested.private_key).toBe(REDACTED);
    expect(output.provider.nested.token).toBe(REDACTED);
    expect(output.history).toEqual({ tokenCount: 37, text: '山门外传来清越的铃声。' });
    expect(source.provider.refreshToken).toBe('refresh-three');
  });

  it('preserves ordinary game fields named token or secret outside provider settings', () => {
    const source = {
      inventory: [{ token: '灵符信物' }],
      world: { secret: '宗门秘史', password: '暗号' },
      worldConfig: { secret: '未公开的门派设定' },
      history: { tokenCount: 37 },
    };

    const output = JSON.parse(serializeJsonWithCredentialRedaction(source));

    expect(output).toEqual(source);
  });

  it('recognizes legacy AI config containers and root-level password fields', () => {
    const output = JSON.parse(serializeJsonWithCredentialRedaction({
      jx_ai_config: { password: 'old-provider-password' },
      password: 'root-password',
    }));

    expect(output.jx_ai_config.password).toBe(REDACTED);
    expect(output.password).toBe(REDACTED);
  });

  it('uses the supplied root field when redacting an individual legacy preview', () => {
    const config = JSON.parse(serializeJsonWithCredentialRedaction({ token: 'old-ai-token' }, 'jx_ai_config'));
    const world = JSON.parse(serializeJsonWithCredentialRedaction({ secret: '宗门秘史' }, 'world'));
    const endpoint = JSON.parse(serializeJsonWithCredentialRedaction(
      'https://api.example.test/v1?key=query-secret&region=cn', 'baseUrl',
    ));

    expect(config.token).toBe(REDACTED);
    expect(world.secret).toBe('宗门秘史');
    expect(new URL(endpoint).searchParams.get('key')).toBe(REDACTED);
  });

  it('keeps path context when a JSON object uses an empty-string key', () => {
    const output = JSON.parse(serializeJsonWithCredentialRedaction({
      '': { token: 'ordinary-game-token' },
      provider: { '': { token: 'provider-secret-token' } },
    }));

    expect(output[''].token).toBe('ordinary-game-token');
    expect(output.provider[''].token).toBe(REDACTED);
  });

  it('redacts credentials in the exported legacy archive without mutating the local save', () => {
    const save = {
      schemaVersion: 1,
      saveId: 'export-1',
      name: '导出测试',
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
      revision: 2,
      canonVersion: 'legacy-unverified',
      ruleVersion: 'rules-not-signed',
      memoryPolicyVersion: 'legacy-unknown',
      character: {},
      location: '山门',
      status: 'pending_rules',
      messages: [{ role: 'assistant', content: '月色照着青石阶。' }],
      legacyArchive: {
        sourceFormat: 'JIUXIAO_LEGACY_JSON',
        sourceVersion: null,
        payload: { providerConfig: { api_key: 'private-key-value', refresh_token: 'private-refresh-value' } },
      },
    } as LocalSave;

    const exported = JSON.parse(serializeSaveForExport(save));

    expect(exported.format).toBe('JIUXIAO_SAVE');
    expect(exported.save.legacyArchive.payload.providerConfig.api_key).toBe(REDACTED);
    expect(exported.save.legacyArchive.payload.providerConfig.refresh_token).toBe(REDACTED);
    expect(save.legacyArchive?.payload.providerConfig).toEqual({
      api_key: 'private-key-value',
      refresh_token: 'private-refresh-value',
    });
  });
});
