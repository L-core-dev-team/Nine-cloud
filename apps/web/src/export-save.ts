import type { LocalSave } from './storage';

const REDACTED = '[已移除密钥]';
const CREDENTIAL_KEYS = new Set([
  'authorization', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'bearertoken',
  'clientsecret', 'apisecret', 'secretkey', 'secretaccesskey', 'privatekey', 'apikey', 'apitoken',
]);
const CREDENTIAL_SUFFIXES = [
  'apikey', 'apitoken', 'apisecret', 'clientsecret', 'secretkey', 'secretaccesskey',
  'privatekey', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'bearertoken', 'authorization',
];
const GENERIC_CREDENTIAL_KEYS = new Set(['token', 'secret', 'password', 'passwd', 'credential', 'credentials']);
const CREDENTIAL_CONTAINERS = new Set([
  'provider', 'providers', 'providerconfig', 'providerconfigs', 'service', 'services', 'serviceconfig',
  'serviceconfigs', 'vendor', 'vendors', 'aiconfig', 'aiprovider', 'llm', 'llmconfig', 'api', 'apiconfig',
  'auth', 'authentication', 'credential', 'credentials', 'secret', 'secrets', 'config', 'configuration',
  'settings', 'connection', 'connections', 'modelconfig', 'modelconfigs', 'modelprovider',
]);
const PROVIDER_PREFIXES = [
  'google', 'openai', 'anthropic', 'deepseek', 'moonshot', 'kimi', 'doubao', 'volcengine', 'qwen',
  'alibaba', 'aliyun', 'baidu', 'zhipu', 'minimax', 'hunyuan', 'tencent', 'azure', 'aws', 'bedrock',
  'gemini', 'claude', 'grok', 'xai', 'cohere', 'mistral', 'groq', 'together', 'fireworks',
  'perplexity', 'siliconflow', 'openrouter', 'ollama', 'huggingface', 'github',
];
const GENERIC_CREDENTIAL_SUFFIXES = ['token', 'secret', 'password', 'passwd', 'credential', 'credentials'];
const ENDPOINT_KEYS = new Set(['baseurl', 'endpoint', 'apiurl', 'requesturl']);
const SENSITIVE_URL_PARAMETERS = new Set([
  'key', 'signature', 'sig', 'xamzsignature', 'xamzcredential', 'xamzsecuritytoken',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isCredentialContainer(key: string): boolean {
  const normalized = normalizeKey(key);
  return CREDENTIAL_CONTAINERS.has(normalized)
    || (/^(jx|ai|llm|api|model|provider|service).+config$/.test(normalized));
}

function isCredentialKey(key: string, parentPath: readonly string[] = []): boolean {
  const normalized = normalizeKey(key);
  if (CREDENTIAL_KEYS.has(normalized) || CREDENTIAL_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return true;

  // Generic names such as "token" and "secret" also occur in game data.
  // Redact them only inside an API/provider/auth container, or when the key
  // itself clearly identifies a provider/service credential.
  if (GENERIC_CREDENTIAL_KEYS.has(normalized)
    && (parentPath.some(isCredentialContainer)
      || (parentPath.length === 0 && ['password', 'passwd'].includes(normalized)))) return true;
  if (/^(provider|service|vendor).+/.test(normalized) && GENERIC_CREDENTIAL_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return true;
  return PROVIDER_PREFIXES.some(prefix => normalized.startsWith(prefix)
    && GENERIC_CREDENTIAL_SUFFIXES.some(suffix => normalized.endsWith(suffix)));
}

function isSensitiveUrlParameter(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_URL_PARAMETERS.has(normalized) || CREDENTIAL_KEYS.has(normalized)
    || CREDENTIAL_SUFFIXES.some(suffix => normalized.endsWith(suffix))
    || GENERIC_CREDENTIAL_KEYS.has(normalized);
}

function redactEndpointUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = 'REDACTED';
    if (url.password) url.password = 'REDACTED';
    for (const name of [...url.searchParams.keys()]) {
      if (isSensitiveUrlParameter(name)) url.searchParams.set(name, REDACTED);
    }
    return url.toString();
  } catch {
    return value;
  }
}

/** Redacts structured credentials in serialized data without changing its source object. */
export function serializeJsonWithCredentialRedaction(value: unknown, rootKey = ''): string {
  if (rootKey && isCredentialKey(rootKey)) return JSON.stringify(REDACTED);
  if (rootKey && typeof value === 'string' && ENDPOINT_KEYS.has(normalizeKey(rootKey))) {
    return JSON.stringify(redactEndpointUrl(value));
  }
  const paths = new WeakMap<object, readonly string[]>();
  let isRootValue = true;
  return JSON.stringify(value, function (key, entry: unknown) {
    if (isRootValue) {
      isRootValue = false;
      if (entry && typeof entry === 'object') paths.set(entry, rootKey ? [rootKey] : []);
      return entry;
    }
    const parentPath = this && typeof this === 'object' ? paths.get(this) ?? [] : [];
    if (isCredentialKey(key, parentPath)) return REDACTED;
    if (typeof entry === 'string'
      && (ENDPOINT_KEYS.has(normalizeKey(key)) || (normalizeKey(key) === 'url' && parentPath.some(isCredentialContainer)))) {
      return redactEndpointUrl(entry);
    }
    if (entry && typeof entry === 'object') paths.set(entry, [...parentPath, key]);
    return entry;
  }, 2) ?? 'null';
}

/** Redacts structured credentials in the downloaded copy without changing the local archive. */
export function serializeSaveForExport(save: LocalSave): string {
  return serializeJsonWithCredentialRedaction({ format: 'JIUXIAO_SAVE', version: 1, save });
}
