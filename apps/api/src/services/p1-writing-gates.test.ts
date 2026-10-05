import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import canonRegistry from '../../../../packages/content/src/canon.registry.json' with { type: 'json' };
import { PROLOGUE_V1_CONTENT_PACK } from '../../../../packages/content/src/prologue/prologue-v1.js';
import { P1_NARRATIVE_HINT_TEXT } from './p1-narrative-hints.js';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
type SourceArtifact = { path: string; sha256: string };
const acceptedIntake = (canonRegistry as { authorOriginalIntakes: readonly {
  id: string; sourceArtifact: SourceArtifact; approvalRecord?: SourceArtifact;
}[] }).authorOriginalIntakes.find(source => source.id === PROLOGUE_V1_CONTENT_PACK.intakeId);

function playerVisibleProse(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(playerVisibleProse);
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return ['paragraphs', 'text', 'utterance', 'lines', 'replies'].flatMap(key =>
      key in row ? playerVisibleProse(row[key]) : []);
  }
  return [];
}

describe('P1 candidate writing gates', () => {
  it('rejects dash punctuation in registered game prose (W3/W3b)', () => {
    const rows = PROLOGUE_V1_CONTENT_PACK.entries
      .filter(entry => entry.kind === 'text' || entry.kind === 'clue')
      .flatMap(entry => playerVisibleProse(entry.content).map(text => ({ id: entry.id, text })))
      .concat(Object.entries(P1_NARRATIVE_HINT_TEXT).map(([id, text]) => ({ id, text })));
    const violations = rows.filter(row => /[—–]/u.test(row.text));
    expect(violations, JSON.stringify(violations)).toEqual([]);
  });

  it('requires every registered prose line to retain source provenance and match an accepted author source (W8)', () => {
    expect(acceptedIntake).toBeDefined();
    if (!acceptedIntake) throw new Error('P1_CANDIDATE_INTAKE_NOT_REGISTERED');
    const acceptedSources = [acceptedIntake.sourceArtifact, ...(acceptedIntake.approvalRecord ? [acceptedIntake.approvalRecord] : [])];
    const sourceText = new Map(acceptedSources.map(source => {
      const bytes = readFileSync(resolve(root, source.path));
      const digest = createHash('sha256').update(bytes).digest('hex');
      expect(digest, `source hash changed: ${source.path}`).toBe(source.sha256);
      return [source.path, bytes.toString('utf8')] as const;
    }));
    expect(sourceText.size).toBeGreaterThanOrEqual(1);
    const approvedSourceArtifact = PROLOGUE_V1_CONTENT_PACK.sourceArtifacts.find(source =>
      source.role === 'effective-authoritative-source' && acceptedSources.some(accepted => accepted.path === source.path));

    const violations: string[] = [];
    for (const entry of PROLOGUE_V1_CONTENT_PACK.entries.filter(row => row.kind === 'text' || row.kind === 'clue')) {
      if (entry.sourceType !== 'author-original' || entry.publicationStatus !== 'candidate-only' ||
          typeof entry.sourceSection !== 'string' || !approvedSourceArtifact || entry.sourceArtifactId !== approvedSourceArtifact.id) {
        violations.push(`${entry.id}:missing-source-binding`);
        continue;
      }
      for (const phrase of playerVisibleProse(entry.content)) {
        if (![...sourceText.values()].some(text => text.includes(phrase))) violations.push(`${entry.id}:${phrase}`);
      }
    }
    for (const [id, phrase] of Object.entries(P1_NARRATIVE_HINT_TEXT)) {
      if (![...sourceText.values()].some(text => text.includes(phrase))) violations.push(`runtime-hint:${id}:${phrase}`);
    }
    expect(violations, JSON.stringify(violations)).toEqual([]);
  });
});
