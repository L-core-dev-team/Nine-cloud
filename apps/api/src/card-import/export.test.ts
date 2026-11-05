import {expect,it} from 'vitest';
import {exportCard} from './export.js';
import {parseFile} from './parser.js';
it('round trips exported versions and keeps unknown fields without mutating input',()=>{
 const doc={spec:'chara_card_v2',spec_version:'2.0',data:{name:'test',description:'d',personality:'p',scenario:'s',first_mes:'hi',mes_example:'x',extensions:{unknown:'keep'}}};
 for(const format of ['v2','v3','png'] as const){const bytes=exportCard(doc,format), parsed=parseFile(bytes,'card');expect((parsed.document?.data as any).extensions.unknown).toBe('keep');expect(parsed.format).toBe(format==='v3'?'v3':'v2');}
 expect(doc.spec).toBe('chara_card_v2');
});
