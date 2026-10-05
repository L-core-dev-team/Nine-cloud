import {Hono} from 'hono';
import {it,expect,vi} from 'vitest';
import {mountGames} from './games.js';
import {AuthoritativeGameService} from '../services/authoritative-game.js';
import {CloudCapacityError} from '../services/cloud-save-service.js';
it('binds game creation to server owner and rejects malformed/oversized or cross-account requests before writes',async()=>{
 const repo={getForOwner:vi.fn(async()=>null),createForOwner:vi.fn(async()=>false)},app=new Hono();
 mountGames(app,new AuthoritativeGameService(repo),{resolveOwnerId:async()=> 'a'});
 const request=(body:unknown,extra:Record<string,string>={})=>app.request('/api/games',{method:'POST',headers:{'content-type':'application/json',...extra},body:JSON.stringify(body)});
 expect((await app.request('/api/games/save-one/action-suggestions',{headers:{'x-jiuxiao-account':'b'}})).status).toBe(401);
 const suggestions=await app.request('/api/games/save-one/action-suggestions');
 expect(suggestions.status).toBe(503);expect(await suggestions.json()).toEqual({code:'RULES_NOT_READY'});
 const body={idempotencyKey:'request-key',choices:{name:'test'}};
 expect((await request(body,{'x-jiuxiao-account':'b'})).status).toBe(401);
 for(const invalid of [null,[],{...body,owner:'b'},{...body,idempotencyKey:'bad'},{...body,choices:[]}])expect((await request(invalid)).status).toBe(400);
 expect((await request({...body,choices:{name:'x'.repeat(17000)}})).status).toBe(413);
 const result=await request(body);expect(result.status).toBe(503);expect(await result.json()).toEqual({code:'RULES_NOT_READY'});expect(repo.createForOwner).not.toHaveBeenCalled();
});
it('reports the shared cloud quota error as a capacity response',async()=>{
 const app=new Hono();
 const service={create:vi.fn(async()=>{throw new CloudCapacityError();})} as unknown as AuthoritativeGameService;
 mountGames(app,service,{resolveOwnerId:async()=> 'a'});
 const response=await app.request('/api/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idempotencyKey:'request-key',choices:{name:'test'}})});
 expect(response.status).toBe(413);
 expect(await response.json()).toEqual({code:'CAPACITY_EXCEEDED'});
});
