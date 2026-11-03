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
  it('rejects regular expressions and overlarge book traversal', () => {
    expect(()=>select([{entries:[entry({keys:['/(a+)+$/']})]}],[],'aaa')).toThrow('WORLDBOOK_UNSUPPORTED_KEY');
    expect(()=>select([{entries:Array.from({length:1001},()=>({enabled:false}))}],[],'')).toThrow('WORLDBOOK_ENTRY_LIMIT');
    expect(()=>select([{entries:[entry({extensions:{unknown_behavior:true}})]}],[],'moon')).toThrow('WORLDBOOK_UNSUPPORTED_FEATURE');
  });
});
