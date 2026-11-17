import { expect, it } from 'vitest';
import type { Pool } from 'pg';
import { CardImportService, type CardModelInput } from './service.js';

it('sends selected lore and card prompts to the injected model, not whole books', async () => {
  let captured: CardModelInput | undefined;
  const query = async (sql: string) => {
    if (sql.startsWith('SELECT * FROM card_import.sessions')) return {rows:[{id:'session',card_id:'card',revision:0}],rowCount:1};
    if (sql.startsWith('SELECT revision FROM card_import.sessions')) return {rows:[{revision:0}],rowCount:1};
    if (sql.startsWith('SELECT * FROM card_import.requests')) return {rows:[],rowCount:0};
    if (sql.startsWith('SELECT count(*)')) return {rows:[{n:0}],rowCount:1};
    if (sql.startsWith('SELECT 1 FROM card_import.requests')) return {rows:[],rowCount:0};
    if (sql.startsWith('SELECT c.*,i.parsed')) return {rows:[{id:'card',parsed:{document:{data:{name:'N',personality:'kind',system_prompt:'custom',post_history_instructions:'post',character_book:{entries:[{keys:['moon'],content:'visible'},{keys:['sun'],content:'hidden'}]}}}}}],rowCount:1};
    if (sql.startsWith('SELECT i.parsed')) return {rows:[],rowCount:0};
    if (sql.startsWith('SELECT action,narrative')) return {rows:[],rowCount:0};
    if (sql.startsWith('SELECT key,status')) return {rows:[{status:'completed'}],rowCount:1};
    return {rows:[],rowCount:1};
  };
  const client={query,release() {}};
  const pool={query,connect:async()=>client} as unknown as Pool;
  const service=new CardImportService(pool,async input=>{captured=input; return 'reply';});
  expect(await service.act('owner','session','key',0,'moon')).toEqual({status:'completed'});
  expect(captured?.worldbooks).toHaveLength(1);
  const wire=JSON.stringify(captured?.messages);
  expect(wire).toContain('visible'); expect(wire).not.toContain('hidden');
  expect(wire).toContain('kind'); expect(wire).toContain('custom'); expect(wire).toContain('post');
});
