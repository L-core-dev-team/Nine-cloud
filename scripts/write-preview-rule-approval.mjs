#!/usr/bin/env node
// Writes an owner-v2 preview-1 rule approval file for host installation
// (apps/api/src/services/preview-rule-approval.ts). Run after `pnpm build`.
//
//   node scripts/write-preview-rule-approval.mjs --plugin <rules.mjs> --out <approval.json> \
//     --issued-by "<who generated this file>" [--days 180] \
//     [--authorization-source <github comment URL>] [--granted-at <ISO time>]
//
// The file cites the owner's real authorization record; it never lists co-signers.
// The API recomputes the semantic digest from source at startup and refuses any
// mismatch, so this script only copies the pinned identity and hashes the plugin.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!key?.startsWith('--') || process.argv[index + 1] === undefined) throw new Error(`Bad argument near ${key ?? '(end)'}`);
  args.set(key.slice(2), process.argv[index + 1]);
}
const required = name => { const value = args.get(name); if (!value?.trim()) throw new Error(`--${name} is required`); return value; };
const pluginPath = resolve(required('plugin'));
const outPath = resolve(required('out'));
const issuedBy = required('issued-by');
const days = Number(args.get('days') ?? 180);
if (!Number.isInteger(days) || days < 1 || days > 400) throw new Error('--days must be an integer between 1 and 400');
// 2026-11-26 standing authorization by the owner (execution ledger section 1).
const source = args.get('authorization-source') ?? 'https://github.com/L-core-dev-team/Nine-cloud/pull/124#issuecomment-7196351027';
const grantedAt = args.get('granted-at') ?? '2026-11-26T15:29:55Z';

const pinnedModule = resolve(root, 'apps/api/dist/services/p1-review-rule-approval.js');
const validatorModule = resolve(root, 'apps/api/dist/services/preview-rule-approval.js');
for (const path of [pinnedModule, validatorModule]) if (!existsSync(path)) throw new Error(`Missing ${path}; run pnpm build first`);
const { P1_REVIEW_RULE_APPROVAL: pinned } = await import(pathToFileURL(pinnedModule).href);
const { validatePreviewRuleApproval, PREVIEW_APPROVAL_V2_FORMAT, PREVIEW_APPROVAL_V2_SCOPE } = await import(pathToFileURL(validatorModule).href);

const issued = new Date(Math.floor(Date.now() / 1000) * 1000);
const approval = {
  format: PREVIEW_APPROVAL_V2_FORMAT,
  scope: PREVIEW_APPROVAL_V2_SCOPE,
  ruleVersion: pinned.ruleVersion,
  canonVersion: pinned.canonVersion,
  memoryPolicyVersion: pinned.memoryPolicyVersion,
  semanticSha256: pinned.semanticSha256,
  pluginSha256: 'sha256:' + createHash('sha256').update(readFileSync(pluginPath)).digest('hex'),
  authorization: { owner: 'LYL', source, grantedAt },
  issuedBy,
  issuedAt: issued.toISOString().replace('.000Z', 'Z'),
  expiresAt: new Date(issued.getTime() + days * 86_400_000).toISOString().replace('.000Z', 'Z'),
};
validatePreviewRuleApproval(approval, pinned, Date.now());
writeFileSync(outPath, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ written: outPath, semanticSha256: approval.semanticSha256, pluginSha256: approval.pluginSha256, expiresAt: approval.expiresAt }));
