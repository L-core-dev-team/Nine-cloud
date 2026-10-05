import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const format = 'jiuxiao-p1-rule-candidate-bundle-v1';

// This bundle binds the accepted gameplay sources, the candidate rulebook,
// parser, contracts, pure settlement/projection code, and focused regressions.
// API activation and deployment gates are intentionally outside this bundle.
const files = [
  'docs/九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md',
  'docs/acceptance/2026-10-04/P1-author-inputs/P1-MAP-作者可执行映射.md',
  'docs/acceptance/2026-10-04/P1-author-inputs/P1-NLU-双作者盲标表.md',
  'docs/acceptance/2026-10-04/P1-author-inputs/P1-PR51-技术审阅依据.md',
  'docs/acceptance/2026-10-04/P1-author-inputs/P1-审阅结论-代签.md',
  'docs/acceptance/2026-10-04/P1-author-inputs/P1-作者共同认可与PR-4验收裁决-2026-10-05.md',
  'docs/acceptance/2026-10-04/P1-author-inputs/PR-4-执行规格对照与边界裁定.md',
  'docs/acceptance/2026-10-04/P1-author-signed-evidence/G03-行动规则表.md',
  'packages/contracts/src/action.ts',
  'packages/contracts/src/decision.ts',
  'packages/contracts/src/errors.ts',
  'packages/contracts/src/event.ts',
  'packages/contracts/src/index.ts',
  'packages/contracts/src/json-bounds.ts',
  'packages/contracts/src/prologue.ts',
  'packages/contracts/src/save.ts',
  'packages/contracts/src/state-delta.ts',
  'packages/contracts/src/turn.ts',
  'packages/contracts/src/world.ts',
  'packages/content/src/canon.registry.json',
  'packages/content/src/index.ts',
  'packages/content/src/prologue/prologue-v1.rulebook-candidate.ts',
  'packages/content/src/prologue/prologue-v1.test.ts',
  'packages/content/src/prologue/prologue-v1.ts',
  'packages/content/src/rules/prologue-v1.constants.ts',
  'packages/domain/src/event-log.ts',
  'packages/domain/src/index.ts',
  'packages/domain/src/nlu/action-parser.test.ts',
  'packages/domain/src/nlu/action-parser.ts',
  'packages/domain/src/nlu/index.ts',
  'packages/domain/src/nlu/prologue-v1-nlu-fixtures.test.ts',
  'packages/domain/src/nlu/prologue-v1-nlu-fixtures.ts',
  'packages/domain/src/prologue-v1-candidate.test.ts',
  'packages/domain/src/prologue-v1-rules.test.ts',
  'packages/domain/src/prologue-v1-rules.ts',
  'packages/domain/src/prologue-v1-time.ts',
  'packages/domain/src/rules.ts',
  'packages/domain/src/state-delta.ts',
  'pnpm-lock.yaml',
].sort();

const manifest = files.map(path => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
const digestInput = `${format}\n${manifest.map(({ path, sha256 }) => `${path}\0${sha256}`).join('\n')}\n`;
const sha256 = createHash('sha256').update(digestInput, 'utf8').digest('hex');

process.stdout.write(`${JSON.stringify({ format, sha256, files: manifest }, null, 2)}\n`);
