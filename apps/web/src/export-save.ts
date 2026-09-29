import type { LocalSave } from './storage';

const REDACTED = '[已移除密钥]';
const CREDENTIAL_KEYS = new Set([
  'authorization', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'bearertoken', 'token',
  'clientsecret', 'apisecret', 'secretkey', 'secretaccesskey', 'privatekey', 'password', 'passwd',
]);
const CREDENTIAL_SUFFIXES = [
  'apikey', 'apitoken', 'apisecret', 'clientsecret', 'secretkey', 'secretaccesskey',
  'privatekey', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'bearertoken',
];

function isCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return CREDENTIAL_KEYS.has(normalized) || CREDENTIAL_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

/** Redacts structured credentials in serialized data without changing its source object. */
export function serializeJsonWithCredentialRedaction(value: unknown, rootKey = ''): string {
  if (rootKey && isCredentialKey(rootKey)) return JSON.stringify(REDACTED);
  return JSON.stringify(value, (key, entry) => isCredentialKey(key) ? REDACTED : entry, 2) ?? 'null';
}

/** Redacts structured credentials in the downloaded copy without changing the local archive. */
export function serializeSaveForExport(save: LocalSave): string {
  return serializeJsonWithCredentialRedaction({ format: 'JIUXIAO_SAVE', version: 1, save });
}
