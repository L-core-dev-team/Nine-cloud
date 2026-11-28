import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as contracts from './index.js';

// Contract snapshot (governance §5.1). Every zod schema exported from the package
// entry is converted to JSON Schema and compared with the committed snapshot, so a
// wire or save format change can never land silently. When this fails on purpose:
//   1. JIUXIAO_WRITE_CONTRACT_SNAPSHOT=1 pnpm --filter @jiuxiao/contracts test
//   2. commit packages/contracts/contract-schema.snapshot.json together with an ADR
//      (docs/adr/) or a migration note (docs/execution/JX-VISION-02/migrations/,
//      packages/db/drizzle/); CI's contract-snapshot gate enforces the pairing.
const snapshotPath = fileURLToPath(new URL('../contract-schema.snapshot.json', import.meta.url));
const zodVersion = (JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  dependencies: Record<string, string>;
}).dependencies.zod;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function exportSchemas() {
  const schemas: Record<string, unknown> = {};
  for (const name of Object.keys(contracts).sort()) {
    const value = (contracts as Record<string, unknown>)[name];
    if (!(value instanceof z.ZodType)) continue;
    // Strict conversion: an unrepresentable type throws instead of being widened to {}.
    schemas[name] = canonical(z.toJSONSchema(value, { target: 'draft-2020-12', io: 'input' }));
  }
  const body = canonical({ format: 'jiuxiao-contract-schema-snapshot-v1', zod: zodVersion, schemas });
  const text = `${JSON.stringify(body, null, 2)}\n`;
  return { text, count: Object.keys(schemas).length, sha256: createHash('sha256').update(text).digest('hex') };
}

describe('contract JSON Schema snapshot', () => {
  const actual = exportSchemas();
  if (process.env.JIUXIAO_WRITE_CONTRACT_SNAPSHOT === '1') writeFileSync(snapshotPath, actual.text);

  it('exports every public zod schema', () => {
    expect(actual.count).toBeGreaterThan(0);
  });

  it('matches the committed snapshot', () => {
    expect(existsSync(snapshotPath), 'packages/contracts/contract-schema.snapshot.json is missing').toBe(true);
    const expected = readFileSync(snapshotPath, 'utf8').replace(/\r\n/g, '\n');
    if (expected !== actual.text) {
      const before = (JSON.parse(expected) as { schemas: Record<string, unknown> }).schemas;
      const after = (JSON.parse(actual.text) as { schemas: Record<string, unknown> }).schemas;
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter(name => JSON.stringify(before[name]) !== JSON.stringify(after[name])).sort();
      throw new Error([
        `Contract schema drift in ${changed.length} schema(s): ${changed.join(', ')}.`,
        'If the change is intended, regenerate with JIUXIAO_WRITE_CONTRACT_SNAPSHOT=1 pnpm --filter @jiuxiao/contracts test',
        'and commit the snapshot together with an ADR (docs/adr/) or a migration note',
        '(docs/execution/JX-VISION-02/migrations/ or packages/db/drizzle/) describing compatibility for existing saves and clients.',
      ].join(' '));
    }
  });
});
