import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDataset, validateDataset } from './dataset.ts';
import { goldQuestions } from './gold.ts';
import { HistoryIndex, estimateTokens, packEvidence, serializeEvidence } from './retrieval.ts';
import { assess, runEvaluation } from './evaluate.ts';
import type { Query } from './types.ts';

const data = generateDataset();
const index = new HistoryIndex(data);
const player: Query['audience'] = { kind: 'player' };
const ask = (text: string, asOfTurn = 200, budget = 4096) => index.search({ text, asOfTurn, audience: player }, budget);

test('200/500/1000 continuous deterministic synthetic histories have valid independent sources', () => {
  for (const size of [200, 500, 1000]) {
    const history = generateDataset(size); validateDataset(history);
    assert.deepEqual(history, generateDataset(size));
    assert.equal(history.turns.length, size);
    assert.equal(history.turns[199]!.gameTime, '第10日暮');
  }
  assert.throws(() => generateDataset(199), RangeError);
});
test('gold oracle has 60 unique independent questions and real explicitly cited sources/facts', () => {
  assert.equal(goldQuestions.length, 60);
  assert.equal(new Set(goldQuestions.map(q => q.questionId)).size, 60);
  for (const q of goldQuestions) {
    assert.equal(q.multipleEvidence, q.expectedSourceIds.length > 1);
    assert.equal(q.noEvidence, q.expectedSourceIds.length === 0);
    for (const id of q.expectedSourceIds) {
      const source = data.turns.find(s => s.sourceId === id);
      assert.ok(source && source.turnId <= q.asOfTurn);
      if (q.audience.kind === 'npc') assert.ok(source.authorizedNpcIds.includes(q.audience.npcId));
    }
    for (const fact of q.correctFacts) {
      const source = data.turns.find(s => q.expectedSourceIds.includes(s.sourceId) && s.facts.some(f => f.id === fact.id));
      assert.ok(source, `${q.questionId}: missing manual fact ${fact.id}`);
      assert.equal(source.facts.find(f => f.id === fact.id)!.value, fact.value);
    }
  }
});
test('exact event lookup returns original narrative and provenance, never an invented answer', () => {
  const r = ask('事件 e010-gift 发生了什么？');
  assert.deepEqual(r.evidence.map(s => s.sourceId), ['s010']);
  assert.equal(r.evidence[0]!.narrative, data.turns[9]!.narrative);
  assert.deepEqual(r.evidence[0]!.eventIds, ['e010-gift']);
});
test('early gift is recoverable at turn 180 after 170 turns', () => {
  const r = ask('我第一次遇到那名剑修时，他交给了我什么？', 180);
  assert.equal(r.ranked[0]!.sourceId, 's010');
  assert.ok(r.evidence.some(s => s.facts.some(f => f.id === 'f010-bell')));
});
test('explicit similar person names do not silently alias', () => {
  const r = ask('沈雁交给我的药册封面是什么？');
  assert.ok(r.evidence.some(s => s.sourceId === 's012'));
  assert.ok(!r.evidence.some(s => s.sourceId === 's010'));
});
test('NPC secret filtering happens before ranking, and does not erase the player archive', () => {
  const q = { text: '陆迟说密信藏在哪里，这是否已经证实？', asOfTurn: 200 };
  const npc = index.search({ ...q, audience: { kind: 'npc', npcId: 'p-su' } }, 4096);
  assert.ok(!npc.ranked.some(s => s.sourceId === 's045'));
  assert.ok(!npc.context.includes('第三块砖'));
  for (const document of data.turns.filter(s => s.authorizedNpcIds.includes('p-su'))) {
    assert.ok(!document.narrative.includes('密信'), 'Public NPC source must not carry private narrator detail');
  }
  assert.ok(index.search({ ...q, audience: player }, 4096).evidence.some(s => s.sourceId === 's045'));
  assert.deepEqual(data, generateDataset());
});
test('following a historical link cannot leak an unauthorized original source', () => {
  const history = structuredClone(data);
  history.turns[184]!.historicalSources.push('s045');
  const r = new HistoryIndex(history).search({ text: '苏禾同行的前后来源有哪些？', asOfTurn: 200, audience: { kind: 'npc', npcId: 'p-su' } }, 4096);
  assert.ok(r.evidence.some(s => s.sourceId === 's185'));
  assert.ok(!r.ranked.some(s => s.sourceId === 's045'));
  assert.ok(!r.context.includes('密信'));
});
test('as-of clock hides future sources AND future expiry metadata', () => {
  const r = ask('事件 e028-transfer', 30);
  assert.deepEqual(r.ranked.map(s => s.sourceId), ['s028']);
  assert.equal(r.evidence[0]!.facts[0]!.validUntil, undefined);
  assert.equal(r.evidence[0]!.factStates[0]!.status, 'current');
  assert.ok(!r.context.includes('..60'));
});
test('historical ownership is distinguished from current ownership', () => {
  const old = ask('事件 e028-transfer', 200);
  assert.equal(old.evidence[0]!.factStates[0]!.status, 'historical');
  const current = ask('现在青玉佩归谁持有？');
  assert.equal(current.ranked[0]!.sourceId, 's190');
  assert.equal(current.evidence[0]!.facts[0]!.value, '旅人');
});
test('rumors remain unverified even after independent confirmation; sensory detail is not a rule event', () => {
  const rumor = ask('沈砚是守堤人的早期传闻来自哪里？');
  const source = rumor.evidence.find(s => s.sourceId === 's020')!;
  assert.ok(source);
  assert.equal(source.factStates[0]!.status, 'unverified');
  assert.equal(source.facts[0]!.kind, 'character-claim');
  const detail = ask('药册原文描述的气味是什么？').evidence.find(s => s.sourceId === 's150')!;
  assert.deepEqual(detail.eventIds, []);
  assert.equal(detail.facts[0]!.kind, 'narrative-detail');
});
test('nonexistent event and unsupported destructive action are refused', () => {
  for (const text of ['事件 e999-gift 发生了什么？', '药册曾经被烧毁的事件是什么？']) {
    const r = ask(text); assert.equal(r.enoughEvidence, false); assert.deepEqual(r.evidence, []);
  }
});
test('range filter and player/NPC clock errors fail safely', () => {
  const r = index.search({ text: '青玉佩归属', asOfTurn: 200, audience: player, turnRange: [100, 200] }, 4096);
  assert.ok(r.ranked.every(s => s.turnId >= 100 && s.turnId <= 200));
  const time = index.search({ text: '青玉佩归属', asOfTurn: 200, audience: player, gameMinuteRange: [119 * 72, 189 * 72] }, 4096);
  assert.deepEqual(time.ranked.map(s => s.sourceId).sort(), ['s120', 's190']);
  assert.throws(() => index.search({ text: '铜铃', asOfTurn: 200, audience: player, gameMinuteRange: [5, 2] }), TypeError);
  assert.throws(() => ask('', 200), TypeError);
  assert.throws(() => ask('铜铃', 201), TypeError);
  assert.throws(() => index.search({ text: '铜铃', asOfTurn: 200, audience: { kind: 'npc', npcId: 'unknown' } }), TypeError);
});
test('all 60 questions respect all budgets with complete source texts and explicit estimates', () => {
  for (const budget of [512, 1024, 2048, 4096]) for (const q of goldQuestions) for (const strategy of ['recent', 'historical'] as const) {
    const r = index.search({ text: q.text, asOfTurn: q.asOfTurn, audience: q.audience, ...(q.turnRange ? { turnRange: q.turnRange } : {}) }, budget, strategy);
    assert.ok(r.estimatedTokens <= budget);
    assert.equal(r.estimatedTokens, estimateTokens(r.context));
    assert.match(r.tokenMethod, /ESTIMATE/);
    for (const s of r.evidence) assert.ok(r.context.includes(s.narrative));
    assert.ok(r.ranked.every(s => s.turnId <= q.asOfTurn));
  }
});
test('insufficient budget cannot turn a partial source into a confident answer', () => {
  const r = ask('青玉佩的全部归属变化经过是什么？', 200, 1);
  assert.deepEqual(r.evidence, []); assert.equal(r.enoughEvidence, false);
  assert.ok(r.omittedSourceIds.length >= 4);
  assert.throws(() => packEvidence(r.ranked, 0), RangeError);
});
test('packer skips oversize sources without cutting a claim qualification', () => {
  const r = ask('事件 e010-gift');
  const long = { ...r.ranked[0]!, sourceId: 'oversize', narrative: '未证实'.repeat(10000) };
  const short = r.ranked[0]!;
  const packed = packEvidence([long, short], estimateTokens(serializeEvidence(short)));
  assert.deepEqual(packed.evidence.map(s => s.sourceId), ['s010']);
  assert.deepEqual(packed.omittedSourceIds, ['oversize']);
});
test('evaluator detects missing evidence, wrong fact values/status, future and unauthorized sources', () => {
  const q = goldQuestions.find(q => q.questionId === 'Q38')!;
  const result = ask('事件 e010-gift');
  assert.equal(assess(data, q, result).pass, true);
  const altered = structuredClone(result);
  altered.evidence[0]!.facts.find(f => f.id === 'f010-bell')!.value = '错误人物赠送';
  assert.equal(assess(data, q, altered).pass, false);
  altered.evidence[0]!.factStates.find(f => f.factId === 'f010-bell')!.status = 'unverified';
  assert.equal(assess(data, q, altered).factResults[0]!.statusCorrect, false);
  const npcQ = goldQuestions.find(q => q.questionId === 'Q28')!;
  const leaked = ask('陆迟说密信藏在哪里？');
  assert.ok(assess(data, npcQ, leaked).leakedSourceIds.includes('s045'));
  const oldQ = { ...q, asOfTurn: 1 };
  assert.ok(assess(data, oldQ, result).futureSourceIds.includes('s010'));
});
test('quality results are reproducible; elapsed time is excluded from this assertion', () => {
  const a = runEvaluation(data, goldQuestions, 1024, 'historical');
  const b = runEvaluation(data, goldQuestions, 1024, 'historical');
  const stable = (r: typeof a) => ({ metrics: { ...r.metrics, latencyMs: null }, records: r.records.map(({ elapsedMs, ...row }) => row) });
  assert.deepEqual(stable(a), stable(b));
});
