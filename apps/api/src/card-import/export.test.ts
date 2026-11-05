import {expect,it} from 'vitest';
import {exportCard} from './export.js';
import {parseFile} from './parser.js';
it('round trips exported versions and keeps unknown fields without mutating input',()=>{
 const doc={spec:'chara_card_v2',spec_version:'2.0',data:{name:'test',description:'d',personality:'p',scenario:'s',first_mes:'hi',mes_example:'x',extensions:{unknown:'keep'}}};
 for(const format of ['v2','v3','png'] as const){const bytes=exportCard(doc,format), parsed=parseFile(bytes,'card');expect((parsed.document?.data as any).extensions.unknown).toBe('keep');expect(parsed.format).toBe(format==='v3'?'v3':'v2');}
 expect(doc.spec).toBe('chara_card_v2');
});
it('preserves original PNG image chunks while replacing card metadata',()=>{
 const data={name:'test',description:'before',personality:'p',scenario:'s',first_mes:'hi',mes_example:'x'};
 const original=exportCard(data,'png'), edited=exportCard({...data,description:'after'},'png',original);
 const chunks=(b:Buffer)=>{const out:Buffer[]=[];for(let i=8;i<b.length;){const n=b.readUInt32BE(i),end=i+n+12;if(b.toString('ascii',i+4,i+8)!=='tEXt')out.push(b.subarray(i,end));i=end;}return out;};
 expect(chunks(edited)).toEqual(chunks(original));expect((parseFile(edited,'card').document?.data as any).description).toBe('after');
});
