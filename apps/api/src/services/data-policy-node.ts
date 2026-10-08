import { readFileSync } from 'node:fs';
import { assertDataPolicy, parseDataPolicy, type DataPolicy } from './data-policy.js';

export function loadDataPolicy(path: string | undefined): DataPolicy | undefined {
  if (!path) return undefined;
  const bytes = readFileSync(path);
  if (bytes.length > 16_384) throw new Error('INVALID_DATA_POLICY');
  const policy = parseDataPolicy(JSON.parse(bytes.toString('utf8')));
  assertDataPolicy(policy);
  return policy;
}
