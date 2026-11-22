import { describe, expect, it } from 'vitest';
import { chooseHistoryQuotes } from './history-recall.js';

const promise = { revision: 1, key:'k1', source:'character' as const, topic:'承诺' as const, quote:'我承诺：还铃。', prefix:'我承诺' };
const goal = { ...promise, revision:2, key:'k2', topic:'目标' as const, quote:'目标：到白港。' };
const keys = ['k2','k3','k4','k5'];

describe('bounded history quote selection', () => {
  it('spends optional history for a cited quote and protects the latest two turns', () => {
    const used = chooseHistoryQuotes('session',[promise],keys,'baseline',(quotes,drop) =>
      drop===2 ? quotes[0]!.quote : undefined);
    expect(used.input).toBe(promise.quote);
    expect(used.decisions[0]?.reason).toBe('included');
    const skipped = chooseHistoryQuotes('session',[promise],keys,'baseline',(_,drop) => drop>2?'wrong':undefined);
    expect(skipped).toEqual({input:'baseline',decisions:[{revision:1,topic:'承诺',reason:'budget'}]});
  });
  it('does not duplicate or evict a higher priority source already in ordinary history', () => {
    const result = chooseHistoryQuotes('session',[goal,promise],keys,'baseline',(_,drop)=>drop>0?'evicted':undefined);
    expect(result.input).toBe('baseline');
    expect(result.decisions.map(d=>d.reason)).toEqual(['in_history','budget']);
  });
  it('counts encoded bytes including provenance and never sends partial or withdrawn quotes', () => {
    const big = '船'.repeat(158);
    const result = chooseHistoryQuotes('session',[
      {...promise,quote:big},{...goal,quote:big},
      {...goal,quote:null},{...goal,quote:'完成目标',prefix:'完成目标'},
    ],[],0,(quotes)=>quotes.length);
    expect(result.input).toBe(1);
    expect(result.decisions.map(d=>d.reason)).toEqual(['included','budget','unquotable','withdrawn']);
  });
});
