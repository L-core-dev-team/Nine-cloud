import type { LocalSave } from './storage';

const REDACTED = '[已移除密钥]';
const CREDENTIAL_KEYS = new Set([
  'authorization', 'accesstoken', 'authtoken', 'bearertoken', 'clientsecret', 'secretkey',
]);

function isCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.endsWith('apikey') || normalized.endsWith('apitoken') || CREDENTIAL_KEYS.has(normalized);
}

/** Redacts structured credentials in serialized data without changing its source object. */
export function serializeJsonWithCredentialRedaction(value: unknown): string {
  return JSON.stringify(value, (key, entry) => isCredentialKey(key) ? REDACTED : entry, 2) ?? 'null';
}

/** Redacts structured credentials in the downloaded copy without changing the local archive. */
export function serializeSaveForExport(save: LocalSave): string {
  return serializeJsonWithCredentialRedaction({ format: 'JIUXIAO_SAVE', version: 1, save });
}
