import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { resolve,join } from 'node:path';
import { complexHistory } from './corpus.ts';
import { authoredQuestions } from './oracle-authoring.ts';
import { validateDataset } from '../p6-longmem/dataset.ts';
import type { GoldQuestion } from '../p6-longmem/types.ts';
const out=resolve('tests/experiments/p6-longmem-hardening/fixtures');
mkdirSync(out,{recursive:true});
const data=complexHistory();validateDataset(data);
const questions=authoredQuestions();
for(const group of [questions.development,questions.frozen]) {
  assert.equal(group.length,50);assert.equal(new Set(group.map(q=>q.questionId)).size,50);
  for(const q of group) {
    for(const id of q.expectedSourceIds) {
      const source=data.turns.find(s=>s.sourceId===id);assert.ok(source && source.turnId<=q.asOfTurn,q.questionId);
      if(q.audience.kind==='npc')assert.ok(source.authorizedNpcIds.includes(q.audience.npcId));
    }
    for(const f of q.correctFacts) {
      const found=data.turns.filter(s=>q.expectedSourceIds.includes(s.sourceId)).flatMap(s=>s.facts).find(x=>x.id===f.id);
      assert.ok(found);assert.equal(found.value,f.value,q.questionId);
      const state=found.kind==='character-claim'?'unverified':found.validUntil!==undefined && found.validUntil<=q.asOfTurn?'historical':'current';
      assert.equal(state,f.status,q.questionId);
    }
  }
}
const entries:[string,unknown][]=[['complex-history-1000.json',data],['development-questions.json',questions.development],['frozen-questions.json',questions.frozen]];
const files=[];
for(const [name,value] of entries) {const text=JSON.stringify(value,null,2)+'\n';writeFileSync(join(out,name),text);files.push({name,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});}
const old='docs/acceptance/2026-10-11/P6-LONGMEM-01-evidence/review/gold-questions.json';
const lock={stage:'PRE_OPTIMIZATION_FREEZE',scale:data.scale,developmentCount:50,frozenCount:50,
  oldGoldSha256:createHash('sha256').update(readFileSync(old)).digest('hex'),files,
  policy:'Freeze before retrieval changes. Development uses development-questions only. Frozen questions are evaluated once at final unseal; no per-question retuning. AI authored, not human blind evaluation.'};
writeFileSync(join(out,'freeze-manifest.json'),JSON.stringify(lock,null,2)+'\n');
console.log(JSON.stringify(lock,null,2));
