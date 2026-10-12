import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDataset } from './dataset.ts';
import { HistoryIndex } from './retrieval.ts';
import { generateAdversarialDataset } from './adversarial.ts';

test('literally same-name people require a unique alias or stable entity ID', () => {
  const index = new HistoryIndex(generateAdversarialDataset());
  const query = { asOfTurn: 200, audience: { kind: 'player' } as const };
  const ambiguous = index.search({ ...query, text: '苏禾的初遇身份是什么？' }, 4096);
  assert.equal(ambiguous.enoughEvidence, false);
  assert.deepEqual(ambiguous.evidence, []);
  assert.match(ambiguous.reason, /同名/);
  for (const name of ['商馆管事苏禾', 'p-su-other']) {
    const result = index.search({ ...query, text: `${name}初遇身份` }, 4096);
    assert.deepEqual(result.evidence.map(s => s.sourceId), ['s130']);
    assert.equal(result.evidence[0]!.facts[0]!.subject, 'p-su-other');
  }
});

test('narrative-only detail without extracted facts or events is retrievable verbatim', () => {
  const data = generateDataset();
  const source = data.turns[149]!;
  source.facts = [];
  source.tags = [];
  const result = new HistoryIndex(data).search({ text: '药册原文描述的气味是什么？', asOfTurn: 200, audience: { kind: 'player' } }, 1024);
  assert.ok(result.evidence.some(s => s.sourceId === 's150' && s.turnId === 150 && s.narrative === source.narrative));
  assert.equal(result.enoughEvidence, true);
  assert.deepEqual(result.evidence.find(s => s.sourceId === 's150')!.facts, []);
});

test('NPC cannot learn an unauthorized successor from expiry or provenance links', () => {
  const data = generateDataset();
  const index = new HistoryIndex(data);
  const npc = index.search({ text: '事件 e028-transfer', asOfTurn: 200, audience: { kind: 'npc', npcId: 'p-su' } }, 4096);
  const fact = npc.evidence[0]!.facts[0]!;
  assert.equal(fact.validUntil, undefined, 'Su never learned the later transfer at turn 60');
  assert.equal(npc.evidence[0]!.factStates[0]!.status, 'current');
  const linked = index.search({ text: '事件 e060-transfer', asOfTurn: 200, audience: { kind: 'npc', npcId: 'p-shen2' } }, 4096);
  assert.deepEqual(linked.evidence[0]!.historicalSources, []);
  assert.equal(linked.evidence[0]!.facts[0]!.supersedes, undefined);
  assert.ok(!linked.context.includes('s028'));
  const player = index.search({ text: '事件 e028-transfer', asOfTurn: 200, audience: { kind: 'player' } }, 4096);
  assert.equal(player.evidence[0]!.factStates[0]!.status, 'historical');
});

test('same-label transfer events remain separate by event ID and query clock', () => {
  const data = generateDataset();
  const index = new HistoryIndex(data);
  for (const [event, turn, holder] of [['e028-transfer', 28, '旅人'], ['e060-transfer', 60, '沈雁'], ['e120-transfer', 120, '陆迟'], ['e190-transfer', 190, '旅人']] as const) {
    const result = index.search({ text: `事件 ${event}`, asOfTurn: turn, audience: { kind: 'player' } }, 1024);
    assert.deepEqual(result.evidence.map(s => s.turnId), [turn]);
    assert.equal(result.evidence[0]!.facts[0]!.value, holder);
    assert.equal(result.evidence[0]!.factStates[0]!.status, 'current');
  }
});
