import {it,expect,vi,afterEach} from 'vitest';
import {createAuthoritativeGame,createCharacterGame} from './game-creation';
afterEach(()=>vi.unstubAllGlobals());
it('persists creation before dispatch and reuses the request after a lost response',async()=>{
 const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
 const sent:string[]=[];let calls=0;
 vi.stubGlobal('fetch',async(_url:unknown,options:RequestInit)=>{expect(data.size).toBe(1);sent.push(String(options.body));if(++calls===1)throw new TypeError('lost response');return Response.json({save:{schemaVersion:1,saveId:'game',revision:0,ruleVersion:'synthetic',canonVersion:'synthetic',memoryPolicyVersion:'synthetic',state:{playerId:'p',locationId:'origin',elapsedMinutes:0,facts:{}}}});});
 await expect(createAuthoritativeGame('a',{name:'first',goal:'goal'},storage)).rejects.toThrow('lost response');
 expect((await createAuthoritativeGame('a',{name:'later edit',goal:'ignored until recovery'},storage)).saveId).toBe('game');
 expect(sent[0]).toBe(sent[1]);expect(data.size).toBe(0);
});

it('isolates pending character creation by account and from the turn workspace', async () => {
  const rows = new Map<string, string>();
  const storage = {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => { rows.set(key, value); },
    removeItem: (key: string) => { rows.delete(key); },
  };
  const send = vi.fn().mockRejectedValue(new TypeError('lost response'));
  vi.stubGlobal('fetch', send);
  await expect(createCharacterGame('a', {memoryMode:'continue'}, storage)).rejects.toThrow('lost response');
  await expect(createCharacterGame('b', {memoryMode:'forgetting'}, storage)).rejects.toThrow('lost response');
  await expect(createAuthoritativeGame('a', {name:'test', goal:'goal'}, storage)).rejects.toThrow('lost response');
  await expect(createCharacterGame('a', {memoryMode:'forgetting'}, storage)).rejects.toThrow('lost response');
  const bodies = send.mock.calls.map(call => call[1].body);
  expect(rows.size).toBe(3);
  expect(new Set(bodies.slice(0, 3).map(body => JSON.parse(body).idempotencyKey)).size).toBe(3);
  expect(bodies[3]).toBe(bodies[0]);

  storage.setItem('jx_character_game:a', '{}');
  await expect(createCharacterGame('a', {memoryMode:'continue'}, storage)).rejects.toThrow('INVALID_GAME_RECOVERY');
  expect(send).toHaveBeenCalledTimes(4);
  expect(storage.getItem('jx_character_game:a')).toBe('{}');
});
