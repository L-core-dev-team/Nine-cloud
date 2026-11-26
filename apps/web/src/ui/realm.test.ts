import { describe, expect, it } from 'vitest';
import { PROLOGUE_V1, REALM_ORDER } from '@jiuxiao/content';
import { PROLOGUE_V1_RULEBOOK_CANDIDATE } from '@jiuxiao/content/p1-review-candidate';
import { PROLOGUE_CULTIVATION_MAX, realmGlyph, realmPercent, realmStatusFromSave } from './realm';

describe('境界铭牌 · 只读权威存档', () => {
  it('stays pinned to the signed prologue cultivation scale', () => {
    expect(PROLOGUE_CULTIVATION_MAX).toBe(PROLOGUE_V1.CULTIVATION_MAX);
  });
  it('reads 炼体 and the cultivation progress from a prologue-v1 save', () => {
    const status = realmStatusFromSave({ ruleVersion: 'prologue-v1', state: { facts: { cultivationProgress: 2400 } } });
    expect(status).toEqual({ realm: '炼体', index: 0, raw: 2400, max: 10_000, progress: 0.24, perfected: false });
    expect(realmPercent(status!)).toBe(24);
  });
  it('marks 圆满 only when the value is full', () => {
    expect(realmPercent(realmStatusFromSave({ ruleVersion: 'prologue-v1', state: { facts: { cultivationProgress: 9_999 } } })!)).toBe(99);
    expect(realmStatusFromSave({ ruleVersion: 'prologue-v1', state: { facts: { cultivationProgress: 10_000 } } })?.perfected).toBe(true);
  });
  it('reads the local 1.0 preview save, which runs the same reducer on the candidate content binding', () => {
    expect(realmStatusFromSave({ ruleVersion: PROLOGUE_V1_RULEBOOK_CANDIDATE.ruleVersion, state: { facts: { cultivationProgress: 800 } } })?.raw).toBe(800);
    expect(realmStatusFromSave({ ruleVersion: 'prologue-v2', state: { facts: { cultivationProgress: 800 } } })).toBeNull();
    expect(realmStatusFromSave({ ruleVersion: 'prologue-v1-draft', state: { facts: { cultivationProgress: 800 } } })).toBeNull();
  });
  it('shows nothing without an authoritative source', () => {
    expect(realmStatusFromSave(null)).toBeNull();
    expect(realmStatusFromSave({ ruleVersion: 'local-narrative', state: { facts: { cultivationProgress: 10 } } })).toBeNull();
    expect(realmStatusFromSave({ ruleVersion: 'prologue-v1', state: { facts: {} } })).toBeNull();
    expect(realmStatusFromSave({ ruleVersion: 'prologue-v1', state: { facts: { cultivationProgress: -1 } } })).toBeNull();
    expect(realmStatusFromSave({ ruleVersion: 'prologue-v1', state: { facts: { cultivationProgress: 1.5 } } })).toBeNull();
  });
  it('gives every realm a distinct seal character', () => {
    const glyphs = REALM_ORDER.map(realmGlyph);
    expect(glyphs).toEqual(['体', '气', '基', '丹', '婴', '神', '合', '乘', '劫']);
    expect(new Set(glyphs).size).toBe(REALM_ORDER.length);
  });
});
