import {CardError,crc32,parseFile,record} from './parser.js';
import {deflateSync} from 'node:zlib';

/** Serialize the selected saved version; the original import is never mutated. */
export function exportCard(document:Record<string,unknown>,format:'v2'|'v3'|'png'):Buffer {
 const target=format==='v3'?'v3':format==='png'&&document.spec==='chara_card_v3'?'v3':'v2';
 const doc=structuredClone(document), data=record(doc.data)?doc.data:doc;
 const output=record(doc.data)?{...doc,spec:target==='v3'?'chara_card_v3':'chara_card_v2',spec_version:target==='v3'?'3.0':'2.0'}:{spec:target==='v3'?'chara_card_v3':'chara_card_v2',spec_version:target==='v3'?'3.0':'2.0',data};
 const json=Buffer.from(JSON.stringify(output),'utf8');parseFile(json,'card');
 if(format!=='png')return json;
 // A fixed neutral 1px image is used when no cover export has been selected.
 const makeChunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length);type.copy(chunk,4);data.copy(chunk,8);chunk.writeUInt32BE(crc32(Buffer.concat([type,data])),data.length+8);return chunk;};
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),makeChunk('IHDR',header),makeChunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),makeChunk('IEND',Buffer.alloc(0))]);
 const keyword=target==='v3'?'ccv3':'chara', payload=Buffer.concat([Buffer.from(keyword+'\0','latin1'),Buffer.from(json.toString('base64'),'latin1')]);
 const type=Buffer.from('tEXt'),chunk=Buffer.alloc(12+payload.length);chunk.writeUInt32BE(payload.length);type.copy(chunk,4);payload.copy(chunk,8);chunk.writeUInt32BE(crc32(Buffer.concat([type,payload])),8+payload.length);
 const png=Buffer.concat([image.subarray(0,image.length-12),chunk,image.subarray(image.length-12)]);
 try {parseFile(png,'card');}catch{throw new CardError('PNG_EXPORT_INVALID');}return png;
}
