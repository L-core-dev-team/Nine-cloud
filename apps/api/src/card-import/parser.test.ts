import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { parseFile, crc32, base64, FILE_LIMIT } from './parser.js';
export const card = { name:'测试人物',description:'合成测试',personality:'安静',scenario:'测试场景',first_mes:'你好',mes_example:'示例',extensions:{ unknown:{ kept:true } } };
export const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));
function chunk(type: string, data: Buffer) { const b = Buffer.alloc(data.length+12); b.writeUInt32BE(data.length); b.write(type,4); data.copy(b,8); b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4); return b; }
function png(doc: unknown, key='chara') { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1,4); ihdr[8]=8; ihdr[9]=6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('tEXt',Buffer.from(key+'\0'+bytes(doc).toString('base64'))),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),chunk('IEND',Buffer.alloc(0))]); }
describe('card parser boundary', () => {
  it.each(['v1','v2','v3'])('retains original unknown JSON fields %s', version => { const d = version==='v1'?card:{spec:'chara_card_'+version,spec_version:version==='v2'?'2.0':'3.0',data:card}; expect(parseFile(bytes(d),'card').document).toEqual(d); });
  it('extracts PNG V2 and V3 metadata without executing extensions', () => { expect(parseFile(png({spec:'chara_card_v2',spec_version:'2.0',data:card}),'card').format).toBe('v2'); expect(parseFile(png({spec:'chara_card_v3',spec_version:'3.0',data:card},'ccv3'),'card').format).toBe('v3'); });
  it('rejects damaged PNG and unsupported versions', () => { const p=png(card); p[40]=255; expect(()=>parseFile(p,'card')).toThrow(); expect(()=>parseFile(bytes({spec:'future'}),'card')).toThrow('UNSUPPORTED_CARD_VERSION'); });
  it('bounds bytes, nesting and base64 decode', () => { expect(()=>parseFile(Buffer.alloc(FILE_LIMIT+1),'card')).toThrow('FILE_SIZE'); expect(()=>base64('!!!!')).toThrow(); let d: unknown={}; for(let i=0;i<50;i++) d={d}; expect(()=>parseFile(bytes(d),'card')).toThrow('JSON_BOUNDS'); });
  it('retains worldbook and treats attachments as opaque downloads', () => { expect(parseFile(bytes({entries:{a:{content:'hello'}}}),'worldbook').kind).toBe('worldbook'); expect(parseFile(Buffer.from('<script>bad()</script>'),'attachment').document).toBeNull(); });
});
