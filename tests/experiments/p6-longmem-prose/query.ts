import {readFileSync} from 'node:fs';
import {ProseIndex} from './retrieval.ts';
import type {Dataset,Query} from '../p6-longmem/types.ts';
const args=process.argv.slice(2),get=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const text=get('--text');if(!text)throw Error('--text required');
const data=JSON.parse(readFileSync(new URL('./fixtures/history-1000.json',import.meta.url),'utf8')) as Dataset;
const npcId=get('--npc'),query:Query={text,asOfTurn:Number(get('--as-of')??1000),audience:npcId?{kind:'npc',npcId}:{kind:'player'}};
const index=new ProseIndex(data),sourceId=get('--source');
console.log(JSON.stringify(sourceId?index.original(sourceId,query)??{status:'unauthorized-or-unavailable'}:index.search(query,Number(get('--budget')??1024)),null,2));
