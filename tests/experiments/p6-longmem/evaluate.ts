import type { Dataset, GoldQuestion, Retrieval } from './types.ts';
import { HistoryIndex } from './retrieval.ts';
import { performance } from 'node:perf_hooks';

function ratio(n: number, d: number): number | null { return d ? n / d : null; }
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}
export function assess(data: Dataset, question: GoldQuestion, result: Retrieval, k = 8) {
  const selected = new Set(result.evidence.map(s => s.sourceId));
  const topK = new Set(result.ranked.slice(0, k).map(s => s.sourceId));
  const missing = question.expectedSourceIds.filter(id => !selected.has(id));
  const supported = result.evidence.filter(s => question.supportingSourceIds.includes(s.sourceId));
  const factResults = question.correctFacts.map(expected => {
    const source = result.evidence.find(s => s.facts.some(f => f.id === expected.id));
    const fact = source?.facts.find(f => f.id === expected.id);
    const state = source?.factStates.find(s => s.factId === expected.id);
    return { ...expected, present: !!fact, valueCorrect: fact?.value === expected.value, statusCorrect: state?.status === expected.status };
  });
  const targetFacts = data.turns.flatMap(s => s.facts).filter(f => question.correctFacts.some(e => e.id === f.id));
  const targetPredicates = new Set(targetFacts.map(f => f.predicate));
  const targetSubjects = new Set(targetFacts.map(f => f.subject));
  const returnedComparable = result.evidence.flatMap(s => s.facts).filter(f => targetPredicates.has(f.predicate));
  const wrongAttribution = returnedComparable.filter(f => !targetSubjects.has(f.subject));
  const leaked = question.audience.kind === 'npc' ? result.ranked.filter(s => !s.authorizedNpcIds.includes((question.audience as { npcId: string }).npcId)) : [];
  const futureSources = result.ranked.filter(s => s.turnId > question.asOfTurn);
  const correctlyRefused = question.noEvidence && !result.enoughEvidence && result.evidence.length === 0;
  const statusPass = factResults.every(f => f.present && f.valueCorrect && f.statusCorrect);
  const pass = question.noEvidence ? correctlyRefused && !leaked.length
    : !missing.length && statusPass && !leaked.length && !futureSources.length
      && (result.strategy === 'recent' || result.enoughEvidence);
  const serializedFacts = result.evidence.flatMap(s => s.facts.map(f => `${f.subject}/${f.predicate}/${f.value}`));
  const duplicatedFacts = serializedFacts.length - new Set(serializedFacts).size;
  return {
    questionId: question.questionId, text: question.text, pass,
    expectedSourceIds: question.expectedSourceIds, selectedSourceIds: [...selected], topKSourceIds: [...topK],
    missingImportantSourceIds: missing,
    budgetOmittedImportantSourceIds: missing.filter(id => result.omittedSourceIds.includes(id)),
    rankMissedImportantSourceIds: missing.filter(id => !result.ranked.some(s => s.sourceId === id)),
    recallHits: question.expectedSourceIds.filter(id => topK.has(id)).length,
    expectedCount: question.expectedSourceIds.length,
    supportedCount: supported.length, selectedCount: result.evidence.length,
    factResults, temporalPass: question.temporal ? statusPass : null,
    sufficiencyFalseNegative: !question.noEvidence && !missing.length && statusPass && !result.enoughEvidence,
    sufficiencyFalsePositive: question.noEvidence && result.enoughEvidence,
    incorrectAttributionCount: wrongAttribution.length, comparableFactCount: returnedComparable.length,
    correctlyRefused: question.noEvidence ? correctlyRefused : null,
    leakedSourceIds: leaked.map(s => s.sourceId), futureSourceIds: futureSources.map(s => s.sourceId),
    duplicatedFacts, factCount: serializedFacts.length,
    estimatedTokens: result.estimatedTokens, contextBytes: result.contextBytes, elapsedMs: result.elapsedMs,
    enoughEvidence: result.enoughEvidence, reason: result.reason,
    noEvidence: question.noEvidence, temporal: question.temporal,
    longDistance: question.longDistance && question.asOfTurn >= 180,
    // Raw selected source content is retained in failures, not reconstructed summaries.
    failureEvidence: pass ? [] : result.evidence.map(s => ({ sourceId: s.sourceId, turnId: s.turnId, narrative: s.narrative, factStates: s.factStates })),
  };
}

export function runEvaluation(data: Dataset, questions: GoldQuestion[], budget: number, strategy: 'recent' | 'historical') {
  const buildStarted = performance.now();
  const index = new HistoryIndex(data);
  const indexBuildMs = performance.now() - buildStarted;
  const records = questions.map(q => assess(data, q, index.search({
    text: q.text, asOfTurn: q.asOfTurn, audience: q.audience,
    ...(q.turnRange ? { turnRange: q.turnRange } : {}),
  }, budget, strategy)));
  const sum = (key: 'recallHits' | 'expectedCount' | 'supportedCount' | 'selectedCount' | 'incorrectAttributionCount' | 'comparableFactCount' | 'duplicatedFacts' | 'factCount') => records.reduce((n, r) => n + r[key], 0);
  const temporal = records.filter(r => r.temporal);
  const negative = records.filter(r => r.noEvidence);
  const early = records.filter(r => r.longDistance);
  return { turns: data.turns.length, budget, strategy, indexBuildMs,
    metrics: {
      PASS: records.filter(r => r.pass).length, FAIL: records.filter(r => !r.pass).length, BLOCKED: 0,
      recallAt8: ratio(sum('recallHits'), sum('expectedCount')),
      sourcePrecision: ratio(sum('supportedCount'), sum('selectedCount')),
      unsupportedSourceRate: ratio(sum('selectedCount') - sum('supportedCount'), sum('selectedCount')),
      temporalAccuracy: ratio(temporal.filter(r => r.temporalPass).length, temporal.length),
      factMisattributionRate: ratio(sum('incorrectAttributionCount'), sum('comparableFactCount')),
      noEvidenceRefusalRate: ratio(negative.filter(r => r.correctlyRefused).length, negative.length),
      unauthorizedSourceLeakCount: records.reduce((n, r) => n + r.leakedSourceIds.length, 0),
      futureSourceLeakCount: records.reduce((n, r) => n + r.futureSourceIds.length, 0),
      longDistanceForgetRate: ratio(early.filter(r => r.missingImportantSourceIds.length).length, early.length),
      duplicateFactRate: ratio(sum('duplicatedFacts'), sum('factCount')),
      estimatedTokenMean: records.reduce((n, r) => n + r.estimatedTokens, 0) / records.length,
      estimatedTokenMax: Math.max(...records.map(r => r.estimatedTokens)),
      budgetOmittedImportantCount: records.reduce((n, r) => n + r.budgetOmittedImportantSourceIds.length, 0),
      rankMissedImportantCount: records.reduce((n, r) => n + r.rankMissedImportantSourceIds.length, 0),
      sufficiencyFalseNegativeCount: records.filter(r => r.sufficiencyFalseNegative).length,
      sufficiencyFalsePositiveCount: records.filter(r => r.sufficiencyFalsePositive).length,
      latencyMs: { p50: percentile(records.map(r => r.elapsedMs), 0.5), p95: percentile(records.map(r => r.elapsedMs), 0.95), max: Math.max(...records.map(r => r.elapsedMs)) },
    }, records,
  };
}
