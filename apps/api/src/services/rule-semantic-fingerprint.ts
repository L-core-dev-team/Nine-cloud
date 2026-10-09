import { createHash } from 'node:crypto';

export const RULE_SEMANTIC_FINGERPRINT_VERSION = 'jiuxiao-rule-semantic-v2';

export type RuleSemanticDependencies = Readonly<{
  format: 'jiuxiao-p1-rule-semantic-input-v1';
  rulebook: unknown;
  mechanics: unknown;
  externalRuleConstants: Readonly<Record<string, number>>;
  actionTemplates: unknown;
  visibleTargetLabels: unknown;
  memoryPolicyArtifacts: unknown;
  implementationFingerprint: string;
}>;

/**
 * Hashes the rule's JSON data inputs and normalized implementation identity.
 * Player-facing error-message values are intentionally absent from this type.
 */
export function computeRuleSemanticDigest(dependencies: RuleSemanticDependencies): `sha256:${string}` {
  if (!dependencies || typeof dependencies !== 'object'
    || dependencies.format !== 'jiuxiao-p1-rule-semantic-input-v1'
    || !/^sha256:[0-9a-f]{64}$/.test(dependencies.implementationFingerprint)) {
    throw new TypeError('RULE_SEMANTIC_DEPENDENCIES_INVALID');
  }
  const payload = {
    fingerprintVersion: RULE_SEMANTIC_FINGERPRINT_VERSION,
    canonicalization: 'RFC8785-JCS-compatible-json-v1',
    implementationFingerprint: dependencies.implementationFingerprint,
    rulebook: dependencies.rulebook,
    mechanics: dependencies.mechanics,
    externalRuleConstants: dependencies.externalRuleConstants,
    actionTemplates: dependencies.actionTemplates,
    visibleTargetLabels: dependencies.visibleTargetLabels,
    memoryPolicyArtifacts: dependencies.memoryPolicyArtifacts,
  };
  const canonical = canonicalRuleSemanticJson(payload);
  const digest = createHash('sha256')
    .update(`${RULE_SEMANTIC_FINGERPRINT_VERSION}\0`, 'utf8')
    .update(canonical, 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

/** Canonical JSON for the supported I-JSON subset, with JCS object-key ordering. */
export function canonicalRuleSemanticJson(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('RULE_SEMANTIC_NON_JSON_NUMBER');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('RULE_SEMANTIC_NON_JSON_VALUE');
  if (ancestors.has(value)) throw new TypeError('RULE_SEMANTIC_CYCLIC_VALUE');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some(key => typeof key !== 'string' || (key !== 'length' && !/^\d+$/.test(key)))) {
        throw new TypeError('RULE_SEMANTIC_ARRAY_SHAPE_INVALID');
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('RULE_SEMANTIC_ARRAY_HOLE');
        items.push(canonicalize(value[index], ancestors));
      }
      return `[${items.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('RULE_SEMANTIC_OBJECT_SHAPE_INVALID');
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some(key => typeof key !== 'string')) throw new TypeError('RULE_SEMANTIC_SYMBOL_KEY');
    const entries = (ownKeys as string[]).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) throw new TypeError('RULE_SEMANTIC_ACCESSOR_OR_HIDDEN_KEY');
      assertWellFormedUnicode(key);
      return [key, descriptor.value] as const;
    });
    entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item, ancestors)}`).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('RULE_SEMANTIC_INVALID_UNICODE');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('RULE_SEMANTIC_INVALID_UNICODE');
    }
  }
}
