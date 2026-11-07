import { describe, expect, it } from 'vitest';
import { selectWorldbookEntries as select } from './worldbook.js';

describe('bounded card worldbook selection', () => {
  const entry = (extra: Record<string, unknown> = {}) => ({ keys:['moon'], content:'lore', ...extra });
  it('matches primary and rejects missing keys', () => {
    expect(select([{entries:[entry()]}], [], 'the moon')).toHaveLength(1);
    expect(select([{entries:[entry()]}], [], 'the sun')).toHaveLength(0);
  });
  it('supports selective AND and NOT logic, and constants', () => {
    expect(select([{entries:[entry({secondary_keys:['star'],selective:true}), entry({constant:true,content:'always'})]}], [], 'moon star')).toHaveLength(2);
    expect(select([{entries:[entry({secondary_keys:['star'],selectiveLogic:2,selective:true})]}], [], 'moon star')).toHaveLength(0);
    expect(select([{entries:[entry({secondary_keys:['star'],selectiveLogic:2,selective:true})]}], [], 'moon')).toHaveLength(1);
  });
  it('uses message depth, case and whole-word settings', () => {
    const book={scan_depth:1,entries:[entry({case_sensitive:true,matchWholeWords:true})]};
    expect(select([book],[{action:'moon',narrative:'else'}],'Moon')).toHaveLength(0);
    expect(select([book],[],'moonlight')).toHaveLength(0);
    expect(select([book],[],'moon!')).toHaveLength(1);
  });
  it('selects multiple books in stable order and preserves basic position', () => {
    const rows=select([{entries:[entry({constant:true,order:20,position:1})]},{entries:[entry({constant:true,order:10,position:0})]}],[],'');
    expect(rows.map(x=>x.order)).toEqual([10,20]); expect(rows.map(x=>x.position)).toEqual(['before_char','after_char']);
  });
  it('uses bounded SillyTavern probability semantics with injectable synthetic draws', () => {
    const rows=[entry({content:'half',probability:50,useProbability:true}),entry({content:'off',probability:0,useProbability:false}),entry({content:'ext',extensions:{probability:10,use_probability:true}})];
    expect(select([{entries:rows}],[],'moon',()=>0.4).map(x=>x.content)).toEqual(['half','off']);
    expect(select([{entries:rows}],[],'moon',()=>0.9).map(x=>x.content)).toEqual(['off']);
    expect(select([{entries:[entry({probability:100})]}],[],'moon',()=>0.99)).toHaveLength(1);
    expect(()=>select([{entries:[entry({probability:101})]}],[],'moon')).toThrow('WORLDBOOK_INVALID_PROBABILITY');
    expect(()=>select([{entries:[entry({probability:20})]}],[],'moon',()=>1)).toThrow('WORLDBOOK_INVALID_RANDOM');
  });
  it('bounds recursive activation and breaks cycles', () => {
    const book={entries:[{keys:['start'],content:'alpha'},{keys:['alpha'],content:'beta'},{keys:['beta'],content:'alpha'}]};
    expect(select([book],[],'start').map(x=>x.content)).toEqual(['alpha','beta','alpha']);
    expect(()=>select([{entries:Array.from({length:6},(_,i)=>({keys:[i?'key'+i:'go'],content:'key'+(i+1)}))}],[],'go')).toThrow('WORLDBOOK_RECURSION_LIMIT');
    expect(select([{entries:[{keys:['go'],content:'next',preventRecursion:true},{keys:['next'],content:'blocked'}]}],[],'go').map(x=>x.content)).toEqual(['next']);
  });
  it('selects weighted or override group winners before applying probability', () => {
    const a={keys:['moon'],content:'A',group:'g',groupWeight:1},b={keys:['moon'],content:'B',group:'g',groupWeight:3};
    expect(select([{entries:[a,b]}],[],'moon',()=>0.1).map(x=>x.content)).toEqual(['A']);
    expect(select([{entries:[a,b]}],[],'moon',()=>0.9).map(x=>x.content)).toEqual(['B']);
    expect(select([{entries:[a,{...b,groupOverride:true}]}],[],'moon',()=>0.1).map(x=>x.content)).toEqual(['B']);
    expect(select([{entries:[{...a,probability:0},b]}],[],'moon',()=>0.1)).toEqual([]);
    const chain={entries:[{keys:['go'],content:'open',group:'g'},{keys:['open'],content:'excluded',group:'g'}]};
    expect(select([chain],[],'go').map(x=>x.content)).toEqual(['open']);
  });
  it('rejects regular expressions and overlarge book traversal', () => {
    expect(()=>select([{entries:[entry({keys:['/(a+)+$/']})]}],[],'aaa')).toThrow('WORLDBOOK_UNSUPPORTED_KEY');
    expect(()=>select([{entries:Array.from({length:1001},()=>({enabled:false}))}],[],'')).toThrow('WORLDBOOK_ENTRY_LIMIT');
    expect(()=>select([{entries:[entry({extensions:{unknown_behavior:true}})]}],[],'moon')).toThrow('WORLDBOOK_UNSUPPORTED_FEATURE');
  });
});
