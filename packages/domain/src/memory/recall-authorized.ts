import {
  assertAuthorizedObservationOutboxRecord,
  assertAuthorizedObservationSupersessionRecord,
  type AuthorizedRecallObservation,
} from './turn-journal.js';
import {
  FORGETTING_CUE_FLOOR,
  FORGETTING_HALF_LIFE_GAME_MINUTES,
  FORGETTING_HALF_LIFE_OBSERVED_EVENTS,
} from './retrieve.js';

export type RecallSlot = 'current-state' | 'historical-event' | 'subjective-belief';
export type AuthorizedMemoryCue = { query: string; slot: RecallSlot };

export type AuthorizedRecallResult =
  | { status: 'complete'; query: string; slot: RecallSlot; grantId: string; eventId: string; memoryClass: Exclude<AuthorizedRecallObservation['memoryClass'], 'unclassified'>; authorizedFacts: Readonly<Record<string, unknown>>; matchingFields: readonly string[]; supersessions: readonly AuthorizedRecallObservation['supersessions'][number][] }
  | { status: 'partial'; query: string; slot: RecallSlot; candidates: readonly { grantId: string; eventId: string; memoryClass: Exclude<AuthorizedRecallObservation['memoryClass'], 'unclassified'>; summary: string; matchingFields: readonly string[] }[]; omittedCandidates: number }
  | { status: 'abstain'; query: string; slot: RecallSlot; reason: 'no-match' | 'stale-only' | 'unclassified-only'; message: string }
  | { status: 'forgotten'; query: string; slot: RecallSlot; message: string };

/**
 * P4 v2 decay-gated authorized recall (author adjudication, plan B, 2026-10-10).
 * The explicit question shares the already-reviewed narrative forgetting curve;
 * the constants live in retrieve.ts and are never copied here.
 */
export const AUTHORIZED_RECALL_DECAY = Object.freeze({
  halfLifeGameMinutes: FORGETTING_HALF_LIFE_GAME_MINUTES,
  halfLifeObservations: FORGETTING_HALF_LIFE_OBSERVED_EVENTS,
  accessibilityFloor: FORGETTING_CUE_FLOOR,
} as const);

/** Deterministic accessibility of one authorized observation: 2^-(elapsed/10080 + later/16). */
export function observationAccessibility(elapsedGameMinutes: number, laterAuthorizedObservations: number): number {
  if (!Number.isSafeInteger(elapsedGameMinutes) || elapsedGameMinutes < 0
    || !Number.isSafeInteger(laterAuthorizedObservations) || laterAuthorizedObservations < 0) {
    throw new Error('Invalid forgetting decay inputs');
  }
  const halfLives = elapsedGameMinutes / AUTHORIZED_RECALL_DECAY.halfLifeGameMinutes
    + laterAuthorizedObservations / AUTHORIZED_RECALL_DECAY.halfLifeObservations;
  return 0.5 ** halfLives;
}

const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 16;
const STOP_TOKENS = new Set(['我们', '你们', '他们', '她们', '它们', '什么', '怎么', '如何', '是否', '可以', '能够', '记得', '想起', '回忆', '回想', '当时', '后来', '现在', '目前', '如今']);

/**
 * Only explicit memory questions invoke recall. The extracted cue is data, not
 * an instruction, and is never persisted by this parser.
 */
export function recognizeAuthorizedMemoryCue(utterance: string): AuthorizedMemoryCue | null {
  if (typeof utterance !== 'string' || utterance.length > 20_000) return null;
  const text = utterance.normalize('NFKC').trim();
  const patterns: readonly [RecallSlot, RegExp][] = [
    ['subjective-belief', /(?:你觉得|你认为|你怎么看|你对)(.+)$/u],
    ['current-state', /(?:当前(?:的|情况)?|目前(?:的|情况)?|如今(?:的|情况)?|眼下(?:的|情况)?)(.+)$/u],
    ['historical-event', /(?:还记得|记不记得|可记得|记得|回想|回忆|想起)(.+)$/u],
  ];
  for (const [slot, pattern] of patterns) {
    const match = pattern.exec(text);
    const query = match?.[1]?.replace(/[？?。！!，,；;：:\s]+$/gu, '').trim();
    if (query && query.length >= 2 && query.length <= MAX_QUERY_LENGTH) return { query, slot };
  }
  return null;
}

/** Deterministic retrieval over immutable, already-authorized observation records. */
export function recallAuthorizedObservations(rows: readonly AuthorizedRecallObservation[], input: {
  query: string;
  slot: RecallSlot;
  gameMinute: number;
  throughRevision: number;
  /** P4 v2 forgetting saves: gate evidence behind the pinned accessibility floor. */
  forgetting?: boolean;
}): AuthorizedRecallResult {
  if (!Array.isArray(rows) || !input || typeof input !== 'object'
    || typeof input.query !== 'string' || !input.query.trim() || input.query.length > MAX_QUERY_LENGTH
    || !['current-state', 'historical-event', 'subjective-belief'].includes(input.slot)
    || !Number.isSafeInteger(input.gameMinute) || input.gameMinute < 0
    || !Number.isSafeInteger(input.throughRevision) || input.throughRevision < 0) {
    throw new TypeError('Invalid authorized memory recall query.');
  }

  const query = input.query.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  if (!query) throw new TypeError('Invalid authorized memory recall query.');
  const cueTokens = tokens(query);
  const matches: { row: AuthorizedRecallObservation; matchingFields: string[]; exact: boolean; score: number }[] = [];
  let staleMatches = 0;
  let unclassifiedMatches = 0;
  let forgottenMatches = 0;
  const seenGrantIds = new Set<string>();
  // Adjudication 2026-10-10 (problem 2): later counts authorized observations of
  // this NPC in this save with a strictly larger eventRevision, mirroring the
  // narrative layer's forgetting surface. Counted inside the already committed
  // recall boundary, so the count and the evidence pool share one scope.
  const laterCounts = new Map<number, number>();
  if (input.forgetting) {
    const revisionCounts = new Map<number, number>();
    for (const row of rows) revisionCounts.set(row.eventRevision, (revisionCounts.get(row.eventRevision) ?? 0) + 1);
    const sortedRevisions = [...revisionCounts.keys()].sort((left, right) => left - right);
    let later = 0;
    for (let index = sortedRevisions.length - 1; index >= 0; index -= 1) {
      const revision = sortedRevisions[index]!;
      laterCounts.set(revision, later);
      later += revisionCounts.get(revision)!;
    }
  }

  for (const row of rows) {
    if (!row || typeof row !== 'object' || seenGrantIds.has(row.grantId)) throw new TypeError('Invalid or duplicated authorized memory evidence.');
    const { supersessions, ...outbox } = row;
    assertAuthorizedObservationOutboxRecord(outbox);
    assertSupersessions(row, supersessions, input.throughRevision);
    seenGrantIds.add(row.grantId);
    if (row.eventRevision > input.throughRevision || row.observedAtMinute > input.gameMinute) {
      throw new Error('NPC memory evidence exceeds the committed game clock or recall revision.');
    }

    const fields = fieldTexts(row);
    const exactFields = fields.filter(field => normalize(field.value).includes(query)).map(field => field.field);
    if (row.memoryClass === 'unclassified') {
      if (exactFields.length > 0 || hasTokenOverlap(cueTokens, fields)) unclassifiedMatches += 1;
      continue;
    }
    const isSuperseded = supersessions.length > 0;
    if (input.slot === 'current-state' && row.memoryClass !== 'current-state') continue;
    if (input.slot === 'historical-event' && row.memoryClass !== 'historical-event') continue;
    if (input.slot === 'subjective-belief' && row.memoryClass !== 'subjective-belief') continue;

    if (input.slot === 'current-state' && isSuperseded) {
      if (exactFields.length > 0 || hasTokenOverlap(cueTokens, fields)) staleMatches += 1;
      continue;
    }
    if (input.forgetting) {
      const elapsed = Math.max(0, input.gameMinute - row.observedAtMinute);
      const accessibility = observationAccessibility(elapsed, laterCounts.get(row.eventRevision) ?? 0);
      if (accessibility < AUTHORIZED_RECALL_DECAY.accessibilityFloor) {
        // The observation cannot serve as evidence, but a would-be match must
        // surface as "forgotten" instead of a false "never happened".
        const matchingFields = fields.filter(field => tokens(normalize(field.value)).some(token => cueTokens.includes(token))).map(field => field.field);
        if (exactFields.length > 0 || (cueTokens.length >= 2 && matchingFields.length > 0
          && overlapScore(cueTokens, fields) >= 0.5)) forgottenMatches += 1;
        continue;
      }
    }
    if (exactFields.length > 0) {
      matches.push({ row, matchingFields: exactFields, exact: true, score: 1 });
      continue;
    }
    if (cueTokens.length < 2) continue;
    const matchingFields = fields.filter(field => tokens(normalize(field.value)).some(token => cueTokens.includes(token))).map(field => field.field);
    const score = overlapScore(cueTokens, fields);
    if (matchingFields.length > 0 && score >= 0.5) matches.push({ row, matchingFields, exact: false, score });
  }

  const exact = matches.filter(match => match.exact);
  if (exact.length === 0 && matches.length === 0) {
    // Decay answers before supersession: a forgotten observation never leaks
    // whether some matching state was later replaced.
    if (forgottenMatches > 0) {
      return { status: 'forgotten', query: input.query, slot: input.slot, message: '我不太记得了。' };
    }
    if (input.slot === 'current-state' && staleMatches > 0) {
      return { status: 'abstain', query: input.query, slot: input.slot, reason: 'stale-only', message: '这条旧状态后来已变化，我不能把它当作眼下的答案。' };
    }
  }
  if (exact.length === 1) return complete(exact[0]!, input.query, input.slot);
  if (matches.length === 1) return complete(matches[0]!, input.query, input.slot);
  if (matches.length > 1) {
    const ordered = [...matches].sort((left, right) => Number(right.exact) - Number(left.exact)
      || right.score - left.score || right.row.eventRevision - left.row.eventRevision
      || compare(left.row.grantId, right.row.grantId));
    return { status: 'partial', query: input.query, slot: input.slot,
      candidates: ordered.slice(0, MAX_RESULTS).map(match => ({ grantId: match.row.grantId, eventId: match.row.eventId,
        memoryClass: match.row.memoryClass as Exclude<AuthorizedRecallObservation['memoryClass'], 'unclassified'>,
        summary: match.row.summary, matchingFields: [...new Set(match.matchingFields)].sort() })),
      omittedCandidates: Math.max(0, ordered.length - MAX_RESULTS) };
  }
  return { status: 'abstain', query: input.query, slot: input.slot,
    reason: unclassifiedMatches > 0 ? 'unclassified-only' : 'no-match', message: '我没有找到能核对的旧见闻。' };
}

function complete(match: { row: AuthorizedRecallObservation; matchingFields: string[] }, query: string, slot: RecallSlot): AuthorizedRecallResult {
  const fields = [...new Set(match.matchingFields)].sort();
  const authorizedFacts = Object.fromEntries(fields.map(field => [field, match.row.authorizedFacts[field]]));
  return { status: 'complete', query, slot, grantId: match.row.grantId, eventId: match.row.eventId,
    memoryClass: match.row.memoryClass as Exclude<AuthorizedRecallObservation['memoryClass'], 'unclassified'>,
    authorizedFacts, matchingFields: fields, supersessions: match.row.supersessions };
}

function assertSupersessions(row: AuthorizedRecallObservation, values: unknown, throughRevision: number): asserts values is AuthorizedRecallObservation['supersessions'] {
  if (!Array.isArray(values) || values.length > 1 || (values.length > 0 && row.memoryClass !== 'current-state')) {
    throw new TypeError('Invalid authorized memory supersession metadata.');
  }
  for (const item of values) {
    assertAuthorizedObservationSupersessionRecord(item);
    if (item.observationGrantId !== row.grantId || item.saveId !== row.saveId || item.branchId !== row.branchId
      || item.npcId !== row.npcId || item.supersededAtRevision <= row.eventRevision
      || item.supersededAtRevision > throughRevision) {
      throw new TypeError('Memory supersession does not match its authorized observation.');
    }
  }
}

function fieldTexts(row: AuthorizedRecallObservation): { field: string; value: string }[] {
  const output: { field: string; value: string }[] = [];
  for (const field of row.authorizedFields) collectText(row.authorizedFacts[field], field, output, 0);
  return output;
}

function collectText(value: unknown, field: string, output: { field: string; value: string }[], depth: number): void {
  if (typeof value === 'string') { if (value.trim()) output.push({ field, value }); return; }
  if (depth >= 8 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(item => collectText(item, field, output, depth + 1)); return; }
  for (const [key, child] of Object.entries(value)) {
    if (!['__proto__', 'prototype', 'constructor'].includes(key)) collectText(child, field, output, depth + 1);
  }
}

function normalize(value: string): string { return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim(); }

function tokens(value: string): string[] {
  const compact = normalize(value).replace(/[\p{P}\p{S}\s]+/gu, '');
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(compact)) {
    const characters = Array.from(compact);
    return [...new Set(characters.slice(0, -1).map((character, index) => character + characters[index + 1]))]
      .filter(token => !STOP_TOKENS.has(token));
  }
  return [...new Set(compact.split(/[^\p{L}\p{N}_-]+/u).filter(token => token.length > 1 && !STOP_TOKENS.has(token)))];
}

function hasTokenOverlap(queryTokens: readonly string[], fields: readonly { field: string; value: string }[]): boolean {
  return queryTokens.length > 0 && fields.some(field => tokens(normalize(field.value)).some(token => queryTokens.includes(token)));
}

function overlapScore(queryTokens: readonly string[], fields: readonly { field: string; value: string }[]): number {
  if (queryTokens.length === 0) return 0;
  const corpusTokens = new Set(fields.flatMap(field => tokens(normalize(field.value))));
  return queryTokens.filter(token => corpusTokens.has(token)).length / queryTokens.length;
}

function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
