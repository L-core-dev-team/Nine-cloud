import {it,expect,vi,afterEach} from 'vitest';
import {createAuthoritativeGame} from './game-creation';
afterEach(()=>vi.unstubAllGlobals());
it('persists creation before dispatch and reuses the request after a lost response',async()=>{
 const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
 const sent:string[]=[];let calls=0;
 vi.stubGlobal('fetch',async(_url:unknown,options:RequestInit)=>{expect(data.size).toBe(1);sent.push(String(options.body));if(++calls===1)throw new TypeError('lost response');return Response.json({save:{schemaVersion:1,saveId:'game',revision:0,ruleVersion:'synthetic',canonVersion:'synthetic',memoryPolicyVersion:'synthetic',state:{playerId:'p',locationId:'origin',elapsedMinutes:0,facts:{}}}});});
 await expect(createAuthoritativeGame('a',{name:'first',goal:'goal'},storage)).rejects.toThrow('lost response');
 expect((await createAuthoritativeGame('a',{name:'later edit',goal:'ignored until recovery'},storage)).saveId).toBe('game');
 expect(sent[0]).toBe(sent[1]);expect(data.size).toBe(0);
});
