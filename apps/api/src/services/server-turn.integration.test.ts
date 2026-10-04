import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { ActionIntent } from '@jiuxiao/contracts';
import { replayEvents } from '@jiuxiao/domain';
import { RuleResolver } from './rule-resolver.js';
import { ServerTurnService, type ServerTurnRules } from './server-turn.js';
import { createPostgresServerTurnRepository } from './postgres-server-turn.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('ServerTurnService on isolated PostgreSQL (synthetic rules only)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const repository = createPostgresServerTurnRepository(pool);
  const owner = 'turn-fixture-owner-' + randomUUID(); const saveId = 'turn-fixture-save-' + randomUUID();
  const secondSaveId = 'turn-isolation-save-' + randomUUID();
  const templateIds: string[] = [];
  const intent: ActionIntent = { kind: 'move', saveId, actorId: 'fixture-player', expectedRevision: 0,
    idempotencyKey: randomUUID(), payload: { destinationId: 'fixture-gate' } };
  const rules: ServerTurnRules = {
    ruleVersion: 'fixture-only', canonVersion: 'fixture-only', memoryPolicyVersion: 'fixture-only',
    decide: (_, save) => ({ status: 'accepted', nextRevision: save.revision + 1,
      events: [{ id: randomUUID(), saveId, type: 'fixture.travel', beforeRevision: save.revision, afterRevision: save.revision + 1,
        source: 'RULES', ruleVersion: save.ruleVersion, occurredAt: new Date().toISOString(), payload: { destinationId: 'fixture-gate' } }] }),
    reduce: state => ({ ...state, locationId: 'fixture-gate', elapsedMinutes: state.elapsedMinutes + 1,
      facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute) + 1 } }),
    grantsForEvent: event => [{ npcId: 'visible-fixture-npc', eventId: event.id, channel: 'witnessed', authorizationPolicyVersion: 'visibility-v1',
      authorizedFields: ['summary'], authorizedFacts: { summary: 'Public fixture event.' }, visibleSummary: 'Public fixture event.' }],
    policyForNpc: () => 'exact-recall-v1',
  };
  beforeAll(async()=>{for(const id of [owner])await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,id+'@fixture.invalid']);});
  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
      for (const id of templateIds) { await client.query('DELETE FROM turn_events WHERE save_id=$1',[id]); await client.query('DELETE FROM turn_requests WHERE save_id=$1',[id]); await client.query('DELETE FROM game_saves WHERE id=$1 AND owner_id=$2',[id,owner]); }
      await client.query('DELETE FROM turn_events WHERE save_id = $1', [secondSaveId]);
      await client.query('DELETE FROM turn_requests WHERE save_id = $1', [secondSaveId]);
      await client.query('DELETE FROM game_saves WHERE id = $1 AND owner_id = $2', [secondSaveId, owner]);
      await client.query('DELETE FROM turn_events WHERE save_id = $1', [saveId]);
      await client.query('DELETE FROM turn_requests WHERE save_id = $1', [saveId]);
      await client.query('DELETE FROM game_saves WHERE id = $1 AND owner_id = $2', [saveId, owner]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await pool.end();
  });
  it('commits state, events, receipt and visible memory once, even when ten clients race and narration fails', async () => {
    await pool.query('INSERT INTO game_saves (id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot) VALUES ($1, $2, 0, 1, $3, $3, $3, $4::jsonb)',
      [saveId, owner, 'fixture-only', JSON.stringify({ playerId: 'fixture-player', locationId: 'origin', elapsedMinutes: 0, facts: { gameMinute: 0, privateFixture: 'do-not-disclose' } })]);
    const service = new ServerTurnService(repository, rules, async () => { throw new Error('provider-private-detail'); });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.execute(owner, intent, true)));
    expect(results.every(result => result.status === 'accepted')).toBe(true);
    expect(results.filter(result => result.status === 'accepted' && !result.duplicate)).toHaveLength(1);
    expect(JSON.stringify(results)).not.toContain('provider-private-detail');
    expect(await repository.loadSave(owner, saveId)).toMatchObject({ revision: 1, state: { elapsedMinutes: 1, locationId: 'fixture-gate' } });
    const journal = await repository.getForOwner(owner, saveId);
    expect(journal?.memories).toHaveLength(1); expect(journal?.memories[0]?.observations).toHaveLength(1);
    expect(JSON.stringify(journal)).not.toContain('do-not-disclose');
    const counts = await pool.query('SELECT (SELECT count(*)::int FROM turn_requests WHERE save_id = $1) AS requests, (SELECT count(*)::int FROM turn_events WHERE save_id = $1) AS events', [saveId]);
    expect(counts.rows[0]).toEqual({ requests: 1, events: 1 });
    expect(await repository.getReceiptForOwner('another-owner', saveId, intent.idempotencyKey)).toBeNull();
    expect(await service.execute('another-owner', intent)).toEqual({ status: 'not_found' });
    expect(await service.execute(owner, { ...intent, payload: { destinationId: 'changed' } })).toEqual({ status: 'idempotency_conflict' });
  });
  it('resumes from the persisted receipt after service restart, without advancing state again', async () => {
    const restarted = new ServerTurnService(createPostgresServerTurnRepository(pool), rules, async () => 'Presentation recovered.');
    expect(await restarted.execute(owner, intent, true)).toMatchObject({ status: 'accepted', duplicate: true, receipt: { resultingRevision: 1 }, narrative: { status: 'received' } });
    expect(await repository.loadSave(owner, saveId)).toMatchObject({ revision: 1 });
    expect(await new ServerTurnService(repository).execute(owner, { ...intent, expectedRevision: 1, idempotencyKey: randomUUID() })).toEqual({ status: 'rules_not_ready' });
    expect(await repository.loadSave(owner, saveId)).toMatchObject({ revision: 1 });
  });
  it('the same NPC identity in a second save cannot contaminate the first save memory', async () => {
    const before = await repository.getForOwner(owner, saveId);
    await pool.query('INSERT INTO game_saves (id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES ($1,$2,0,1,$3,$3,$3,$4::jsonb)',
      [secondSaveId,owner,'fixture-only',JSON.stringify({playerId:'fixture-player',locationId:'second-origin',elapsedMinutes:0,facts:{gameMinute:0,privateFixture:'second-private'}})]);
    const secondRules: ServerTurnRules = {...rules, decide: (input, save) => ({status:'accepted',nextRevision:save.revision+1,events:[{id:randomUUID(),saveId:input.saveId,type:'fixture.second',beforeRevision:save.revision,afterRevision:save.revision+1,source:'RULES',ruleVersion:save.ruleVersion,occurredAt:new Date().toISOString(),payload:{}}]}),
      grantsForEvent:event=>[{npcId:'visible-fixture-npc',eventId:event.id,channel:'witnessed',authorizationPolicyVersion:'visibility-v1',
        authorizedFields:['summary'],authorizedFacts:{summary:'Only second-save observation.'},visibleSummary:'Only second-save observation.'}]};
    expect((await new ServerTurnService(repository,secondRules).execute(owner,{...intent,saveId:secondSaveId,idempotencyKey:randomUUID()})).status).toBe('accepted');
    expect(await repository.getForOwner(owner,saveId)).toEqual(before);
    const second=await repository.getForOwner(owner,secondSaveId);expect(JSON.stringify(second)).toContain('Only second-save observation.');expect(JSON.stringify(second)).not.toContain('Public fixture event.');expect(JSON.stringify(second)).not.toContain('second-private');
  });
  it('six-class provider template commits, reloads and replays authored deltas without duplicate settlement', async () => {
    const cases = [{kind:'move',payload:{destinationId:'fixture-gate'}},{kind:'cultivate',payload:{techniqueId:'fixture',minutes:1}},{kind:'use_item',payload:{itemId:'fixture'}},{kind:'talk',payload:{npcId:'fixture',utterance:'fixture'}},{kind:'combat',payload:{targetId:'fixture'}},{kind:'quest',payload:{questId:'fixture',choiceId:'fixture'}}];
    const resolver = new RuleResolver({version:{ruleVersion:'fixture-only',ActionRulesVersion:'fixture-actions',CombatRulesVersion:'fixture-combat',canonVersion:'fixture-only',memoryPolicyVersion:'fixture-only'}, resolve:(_intent,save)=>({status:'accepted',outcome:'success',delta:{timeChange:1,locationChange:null,factChanges:[{key:'fixtureCounter',before:{present:false},after:{present:true,value:1}},{key:'gameMinute',before:{present:true,value:save.state.facts.gameMinute},after:{present:true,value:Number(save.state.facts.gameMinute)+1}}]}})},()=>[],()=>'exact-recall-v1');
    for (const input of cases) {
      const id=randomUUID();templateIds.push(id);
      await pool.query('INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES($1,$2,0,1,$3,$3,$3,$4::jsonb)',[id,owner,'fixture-only',JSON.stringify({playerId:'fixture-player',locationId:'origin',elapsedMinutes:0,facts:{gameMinute:0}})]);
      const before=(await repository.loadSave(owner,id))!;
      const request={...input,saveId:id,actorId:'fixture-player',expectedRevision:0,idempotencyKey:randomUUID()} as ActionIntent;
      const result=await new ServerTurnService(repository,resolver).execute(owner,request);
      if(result.status!=='accepted'||result.receipt.decision.status!=='accepted')throw new Error('fixture commit failed');
      const loaded=await repository.loadSave(owner,id);expect(replayEvents(before,result.receipt.decision.events,resolver.reduce.bind(resolver))).toEqual(loaded);
      expect(await new ServerTurnService(createPostgresServerTurnRepository(pool),resolver).execute(owner,request)).toMatchObject({status:'accepted',duplicate:true});
      expect((await repository.loadSave(owner,id))?.revision).toBe(1);
    }
  });
  it('narrative retries cannot overwrite newer status or another owner\'s log', async () => {
    const oldAttempt=randomUUID(),newAttempt=randomUUID();
    await repository.recordNarrativeStatus!(owner,saveId,intent.idempotencyKey,oldAttempt,'generating');
    await repository.recordNarrativeStatus!(owner,saveId,intent.idempotencyKey,newAttempt,'generating');
    await repository.recordNarrativeStatus!(owner,saveId,intent.idempotencyKey,oldAttempt,'received');
    await repository.recordNarrativeStatus!('foreign-owner',saveId,intent.idempotencyKey,newAttempt,'cancelled');
    expect((await pool.query('SELECT narrative_status FROM turn_requests WHERE save_id=$1 AND idempotency_key=$2',[saveId,intent.idempotencyKey])).rows[0].narrative_status).toBe('generating');
    await repository.recordNarrativeStatus!(owner,saveId,intent.idempotencyKey,newAttempt,'received');
    expect((await pool.query('SELECT narrative_status FROM turn_requests WHERE save_id=$1 AND idempotency_key=$2',[saveId,intent.idempotencyKey])).rows[0].narrative_status).toBe('received');
  });
  it('replays a 120-turn persisted game across lost commit replies and service restarts',async()=>{
    const id=randomUUID();templateIds.push(id);
    await pool.query('INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES($1,$2,0,1,$3,$3,$3,$4::jsonb)',[id,owner,'fixture-only',JSON.stringify({playerId:'fixture-player',locationId:'origin',elapsedMinutes:0,facts:{items:150,gameMinute:0}})]);
    const resolver=new RuleResolver({version:{ruleVersion:'fixture-only',ActionRulesVersion:'fixture-actions',CombatRulesVersion:'fixture-combat',canonVersion:'fixture-only',memoryPolicyVersion:'fixture-only'},resolve:(_intent,save)=>({status:'accepted',outcome:'success',delta:{timeChange:1,locationChange:null,factChanges:[{key:'items',before:{present:true,value:save.state.facts.items},after:{present:true,value:Number(save.state.facts.items)-1}},{key:'gameMinute',before:{present:true,value:save.state.facts.gameMinute},after:{present:true,value:Number(save.state.facts.gameMinute)+1}}]}})},event=>[{npcId:'long-witness',eventId:event.id,channel:'witnessed',authorizationPolicyVersion:'visibility-v1',authorizedFields:['summary'],authorizedFacts:{summary:'Synthetic committed fact.'},visibleSummary:'Synthetic committed fact.'}],()=>'exact-recall-v1');
    const before=(await repository.loadSave(owner,id))!;const events:Parameters<typeof replayEvents>[1][number][]=[];
    for(let step=0;step<120;step++){
      const request:ActionIntent={kind:'free_text',saveId:id,actorId:'fixture-player',expectedRevision:step,idempotencyKey:randomUUID(),payload:{text:'Synthetic one-item consumption'}};
      const restarted=createPostgresServerTurnRepository(pool);
      if(step%17===0){const original=restarted.commitAcceptedTurn;restarted.commitAcceptedTurn=async input=>{await original(input);throw new Error('Synthetic lost reply after durable commit');};await expect(new ServerTurnService(restarted,resolver).execute(owner,request)).rejects.toThrow('lost reply');}
      const result=await new ServerTurnService(repository,resolver).execute(owner,request);
      if(result.status!=='accepted'||result.receipt.decision.status!=='accepted')throw new Error('Long-game fixture failed');events.push(...result.receipt.decision.events);
      for(let repeat=0;repeat<2;repeat++)expect(await new ServerTurnService(repository,resolver).execute(owner,request)).toMatchObject({status:'accepted',duplicate:true});
    }
    const after=await repository.loadSave(owner,id);expect(after).toMatchObject({revision:120,state:{elapsedMinutes:120,facts:{items:30}}});
    expect(replayEvents(before,events,resolver.reduce.bind(resolver))).toEqual(after);
    expect((await repository.getForOwner(owner,id))?.memories[0]?.observations).toHaveLength(120);
    expect((await pool.query('SELECT verify_turn_event_chain($1) AS ok',[id])).rows[0].ok).toBe(true);
    const chain=await pool.query('SELECT previous_hash,event_hash FROM turn_events WHERE save_id=$1 ORDER BY sequence',[id]);expect(chain.rows[0].previous_hash).toBe('0'.repeat(64));expect(chain.rows[1].previous_hash).toBe(chain.rows[0].event_hash);
    const tamper=await pool.connect();try{await tamper.query('BEGIN');await tamper.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");await tamper.query('DELETE FROM turn_events WHERE save_id=$1 AND sequence=61',[id]);expect((await tamper.query('SELECT verify_turn_event_chain($1) AS ok',[id])).rows[0].ok).toBe(false);await tamper.query('ROLLBACK');}finally{tamper.release();}

    const counts=await pool.query('SELECT count(*)::int AS count FROM turn_events WHERE save_id=$1',[id]);expect(counts.rows[0].count).toBe(120);
  },30000);
});
