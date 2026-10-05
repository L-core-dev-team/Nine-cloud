import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import canonRegistry from '../canon.registry.json' with { type: 'json' };
import { canonRuntimeEntries } from '../worldbook.js';
import * as publicContent from '../index.js';
import {
  PROLOGUE_V1_CANDIDATE_IDS,
  PROLOGUE_V1_CANDIDATE_INTAKE_ID,
  PROLOGUE_V1_CONTENT_PACK,
  PROLOGUE_V1_SOURCE_ARTIFACTS,
} from './prologue-v1.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');
const sourceHash = (path: string): string => createHash('sha256')
  .update(readFileSync(resolve(packageRoot, path))).digest('hex');
const repoSourceHash = (path: string): string => createHash('sha256')
  .update(readFileSync(resolve(repoRoot, path))).digest('hex');

describe('P1 prologue candidate pack', () => {
  it('binds candidate content and signoff history to the exact current source files', () => {
    const intake = canonRegistry.authorOriginalIntakes.find(({ id }) => id === PROLOGUE_V1_CANDIDATE_INTAKE_ID);
    expect(intake).toBeDefined();
    if (!intake) throw new Error('P1_CANDIDATE_INTAKE_NOT_REGISTERED');
    if (!intake.approvalRecord) throw new Error('P1_CANDIDATE_APPROVAL_RECORD_NOT_REGISTERED');

    expect(intake.sourceArtifact.sha256).toBe(sourceHash('../../docs/九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md'));
    expect(intake.approvalRecord.sha256).toBe(sourceHash('../../docs/acceptance/2026-10-03/九霄1.0-P1-玩法规则与序章-签署表-2026-10-03.xlsx'));
    expect(intake.candidateDocument).toBe('packages/content/src/prologue/prologue-v1.ts');
    expect(intake.candidateDocumentSha256).toBe(sourceHash('src/prologue/prologue-v1.ts'));
    expect(intake.candidateIds).toEqual(PROLOGUE_V1_CANDIDATE_IDS);
    expect(intake.canonPublication).toEqual({
      status: 'pending_separate_s_track_review',
      activeEntriesChanged: false,
      runtimeProjectionChanged: false,
    });
  });

  it('binds every author-original intake digest to its exact repository source', () => {
    for (const intake of canonRegistry.authorOriginalIntakes) {
      expect(repoSourceHash(intake.sourceArtifact.path)).toBe(intake.sourceArtifact.sha256);
      if ('approvalRecord' in intake && intake.approvalRecord) {
        expect(repoSourceHash(intake.approvalRecord.path)).toBe(intake.approvalRecord.sha256);
      }
      expect(repoSourceHash(intake.candidateDocument)).toBe(intake.candidateDocumentSha256);
    }
  });

  it('keeps all authored content candidate-only and outside active Canon and package exports', () => {
    expect(PROLOGUE_V1_CONTENT_PACK.publicationStatus).toBe('candidate-only');
    expect(PROLOGUE_V1_CONTENT_PACK.runtimeEligible).toBe(false);
    expect(new Set(PROLOGUE_V1_CANDIDATE_IDS).size).toBe(PROLOGUE_V1_CANDIDATE_IDS.length);
    expect(PROLOGUE_V1_CONTENT_PACK.entries.every(entry =>
      entry.sourceType === 'author-original'
      && entry.sourceArtifactId === 'p1_execution_spec_current_20261004'
      && entry.publicationStatus === 'candidate-only')).toBe(true);
    expect(canonRegistry.entries.some(({ id }) => PROLOGUE_V1_CANDIDATE_IDS.includes(id))).toBe(false);
    expect(canonRuntimeEntries.some(({ id }) => PROLOGUE_V1_CANDIDATE_IDS.includes(id))).toBe(false);
    expect(publicContent).not.toHaveProperty('PROLOGUE_V1_CONTENT_PACK');
  });

  it('preserves the current Kec time boundary and exposes each unresolved author mapping', () => {
    expect(PROLOGUE_V1_CONTENT_PACK.unresolvedRuleMappings.map(mapping => mapping.slice(0, 10))).toEqual([
      'P1-MAP-01:',
      'P1-MAP-02:',
      'P1-MAP-03:',
      'P1-MAP-04:',
      'P1-MAP-05:',
      'P1-MAP-06:',
    ]);
    expect(PROLOGUE_V1_CONTENT_PACK.unresolvedRuleMappings.join('\n')).not.toContain('DAY_MINUTES');
    const nightText = PROLOGUE_V1_CONTENT_PACK.entries.find(({ id }) => id === 'text_wangqitai_night');
    expect(nightText?.content).toMatchObject({
      interval: 'kecIndex >= 48, where kecIndex = floor((gameMinute - 300) / 15) mod 96',
    });
  });

  it('deep-freezes the candidate pack so callers cannot mutate authored source data', () => {
    const clue = PROLOGUE_V1_CONTENT_PACK.entries.find(({ id }) => id === 'clue_ferry_stuck');
    expect(clue?.kind).toBe('clue');
    expect(Object.isFrozen(PROLOGUE_V1_SOURCE_ARTIFACTS)).toBe(true);
    expect(Object.isFrozen(PROLOGUE_V1_CONTENT_PACK)).toBe(true);
    expect(Object.isFrozen(PROLOGUE_V1_CONTENT_PACK.entries)).toBe(true);
    expect(clue && Object.isFrozen(clue.content)).toBe(true);
    if (!clue || clue.kind !== 'clue') throw new Error('P1_CANDIDATE_CLUE_NOT_FOUND');
    expect(Object.isFrozen(clue.content.text)).toBe(true);
  });
});
