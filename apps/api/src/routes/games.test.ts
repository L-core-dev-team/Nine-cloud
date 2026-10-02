import {Hono} from 'hono';
import {it,expect,vi} from 'vitest';
import {mountGames} from './games.js';
import {AuthoritativeGameService} from '../services/authoritative-game.js';
it('binds game creation to server owner and rejects malformed/oversized or cross-account requests before writes',async()=>{
 const repo={getForOwner:vi.fn(async()=>null),createForOwner:vi.fn(async()=>false)},app=new Hono();
 mountGames(app,new AuthoritativeGameService(repo),{resolveOwnerId:async()=> 'a'});
 const request=(body:unknown,extra:Record<string,string>={})=>app.request('/api/games',{method:'POST',headers:{'content-type':'application/json',...extra},body:JSON.stringify(body)});
 const body={idempotencyKey:'request-key',choices:{name:'test'}};
 expect((await request(body,{'x-jiuxiao-account':'b'})).status).toBe(401);
 for(const invalid of [null,[],{...body,owner:'b'},{...body,idempotencyKey:'bad'},{...body,choices:[]}])expect((await request(invalid)).status).toBe(400);
 expect((await request({...body,choices:{name:'x'.repeat(17000)}})).status).toBe(413);
 const result=await request(body);expect(result.status).toBe(503);expect(await result.json()).toEqual({code:'RULES_NOT_READY'});expect(repo.createForOwner).not.toHaveBeenCalled();
});
