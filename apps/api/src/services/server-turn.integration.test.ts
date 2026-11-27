import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { ActionIntent } from '@jiuxiao/contracts';
import { replayEvents } from '@jiuxiao/domain';
import { RuleResolver } from './rule-resolver.js';
import { ServerTurnService, type ServerTurnRules } from './server-turn.js';
import { createPostgresServerTurnRepository, EVENT_CHAIN_FULL_AUDIT_EVERY, verifyTurnEventChain } from './postgres-server-turn.js';

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
    decide: (action, save) => ({ status: 'accepted', nextRevision: save.revision + 1,
      events: [{ id: randomUUID(), saveId: action.saveId, type: 'fixture.travel', beforeRevision: save.revision, afterRevision: save.revision + 1,
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
  it('counts the fixed profile against turn quotas and rolls back the over-limit turn', async () => {
    const id = 'turn-profile-' + randomUUID();
    templateIds.push(id);
    const state = { playerId: 'fixture-player', locationId: 'origin', elapsedMinutes: 0, facts: { gameMinute: 0 } };
    const profile = { appearance: '青'.repeat(200) };
    await pool.query(`INSERT INTO game_saves
      (id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot,character_profile)
      VALUES ($1,$2,0,1,$3,$3,$3,$4,$5)`, [id, owner, 'fixture-only', state, profile]);
    const policy = { version: 'fixture', expiresAt: '2099-01-01', approvedBy: ['Bird','LYL'],
      maxSaves: 20, perSaveBytes: 512, totalBytes: 100000, trashRetentionDays: 1, backupPolicy: 'fixture' };
    const service = new ServerTurnService(createPostgresServerTurnRepository(pool, false, () => policy), rules);
    const request = { ...intent, saveId: id, idempotencyKey: randomUUID() };
    await expect(service.execute(owner, request)).rejects.toThrow('CLOUD_QUOTA_EXCEEDED');
    expect((await pool.query('SELECT revision,character_profile FROM game_saves WHERE id=$1',[id])).rows)
      .toEqual([{ revision: 0, character_profile: profile }]);
    expect(await repository.getReceiptForOwner(owner, id, request.idempotencyKey)).toBeNull();
    policy.perSaveBytes = 2048;
    expect(await service.execute(owner, request)).toMatchObject({ status: 'accepted', duplicate: false });
    expect((await pool.query('SELECT revision,character_profile FROM game_saves WHERE id=$1',[id])).rows)
      .toEqual([{ revision: 1, character_profile: profile }]);
  });
  it('persists clarifications as receipt-only transactions and validates the linked follow-up', async () => {
    const id = 'turn-clarify-save-' + randomUUID(); templateIds.push(id);
    await pool.query('INSERT INTO game_saves (id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot) VALUES ($1, $2, 0, 1, $3, $3, $3, $4::jsonb)',
      [id, owner, 'fixture-only', JSON.stringify({ playerId: 'fixture-player', locationId: 'origin', elapsedMinutes: 0, facts: { gameMinute: 0 } })]);
    const clarificationRules: ServerTurnRules = { ...rules, decide: (input, save) => ({
      status: 'clarify', question: '你要去哪里？', missingSlots: ['destinationId'], candidates: [],
      interactionId: input.idempotencyKey, revision: save.revision,
    }) };
    const first: ActionIntent = { ...intent, saveId: id, expectedRevision: 0, idempotencyKey: randomUUID() };
    const clarificationService = new ServerTurnService(repository, clarificationRules);
    const [clarification, concurrentRetry] = await Promise.all([
      clarificationService.execute(owner, first), clarificationService.execute(owner, first),
    ]);
    expect(clarification).toMatchObject({ status: 'decision', receipt: { decision: { status: 'clarify', revision: 0 } } });
    expect(concurrentRetry).toEqual(clarification);
    if (clarification.status !== 'decision' || clarification.receipt.decision.status !== 'clarify') throw new Error('Clarification fixture did not persist.');
    expect(clarification.receipt.decision.interactionId).toBe(first.idempotencyKey);

    const unchanged = await repository.loadSave(owner, id);
    expect(unchanged).toMatchObject({ revision: 0, state: { locationId: 'origin', elapsedMinutes: 0 } });
    expect(await repository.getForOwner(owner, id)).toMatchObject({ revision: 0, memories: [] });
    const counts = await pool.query('SELECT (SELECT count(*)::int FROM turn_requests WHERE save_id=$1) AS requests, (SELECT count(*)::int FROM turn_events WHERE save_id=$1) AS events, (SELECT count(*)::int FROM npc_memory_journals WHERE save_id=$1) AS journals', [id]);
    expect(counts.rows[0]).toEqual({ requests: 1, events: 0, journals: 0 });

    expect(await new ServerTurnService(repository, clarificationRules).execute(owner, first)).toEqual(clarification);
    expect(await new ServerTurnService(repository, clarificationRules).execute(owner, { ...first, payload: { destinationId: 'changed' } }))
      .toEqual({ status: 'idempotency_conflict' });

    const followUp: ActionIntent = { ...first, idempotencyKey: randomUUID(), clarificationOf: clarification.receipt.idempotencyKey };
    expect(await new ServerTurnService(repository, rules).execute(owner, followUp)).toMatchObject({
      status: 'accepted', receipt: { clarificationOf: clarification.receipt.idempotencyKey, resultingRevision: 1 },
    });
    const after = await pool.query('SELECT (SELECT count(*)::int FROM turn_requests WHERE save_id=$1) AS requests, (SELECT count(*)::int FROM turn_events WHERE save_id=$1) AS events, (SELECT count(*)::int FROM npc_memory_journals WHERE save_id=$1) AS journals', [id]);
    expect(after.rows[0]).toEqual({ requests: 2, events: 1, journals: 1 });
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
  it('per-turn integrity check hashes only the new tail; full audits and head mismatches still catch tampering',async()=>{
    const id=randomUUID();templateIds.push(id);
    await pool.query('INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES($1,$2,0,1,$3,$3,$3,$4::jsonb)',[id,owner,'fixture-only',JSON.stringify({playerId:'fixture-player',locationId:'origin',elapsedMinutes:0,facts:{items:500,gameMinute:0}})]);
    const resolver=new RuleResolver({version:{ruleVersion:'fixture-only',ActionRulesVersion:'fixture-actions',CombatRulesVersion:'fixture-combat',canonVersion:'fixture-only',memoryPolicyVersion:'fixture-only'},resolve:(_intent,save)=>({status:'accepted',outcome:'success',delta:{timeChange:1,locationChange:null,factChanges:[{key:'items',before:{present:true,value:save.state.facts.items},after:{present:true,value:Number(save.state.facts.items)-1}},{key:'gameMinute',before:{present:true,value:save.state.facts.gameMinute},after:{present:true,value:Number(save.state.facts.gameMinute)+1}}]}})},event=>[{npcId:'tail-witness',eventId:event.id,channel:'witnessed',authorizationPolicyVersion:'visibility-v1',authorizedFields:['summary'],authorizedFacts:{summary:'Synthetic committed fact.'},visibleSummary:'Synthetic committed fact.'}],()=>'exact-recall-v1');
    // Record every integrity check the hot path performs through a pass-through pool.
    const checks:{interval:number;fullAudit:boolean;hashedEvents:number;headSequence:number}[]=[];
    const counted=new Proxy(pool,{get(target,prop){
      if(prop==='query')return async(...args:Parameters<Pool['query']>)=>{const result=await (target.query as (...a:unknown[])=>Promise<{rows:Record<string,unknown>[]}>)(...args);
        if(typeof args[0]==='string'&&args[0].includes('verify_turn_event_chain_incremental')){const row=result.rows[0]!;checks.push({interval:Number((args[1] as unknown[])[1]),fullAudit:row.full_audit===true,hashedEvents:Number(row.hashed_events),headSequence:Number(row.head_sequence)});}
        return result;};
      const value=Reflect.get(target,prop,target);return typeof value==='function'?value.bind(target):value;}});
    const hot=createPostgresServerTurnRepository(counted as Pool);
    const turns=150;
    for(let step=0;step<turns;step++){
      const request:ActionIntent={kind:'free_text',saveId:id,actorId:'fixture-player',expectedRevision:step,idempotencyKey:randomUUID(),payload:{text:'Synthetic one-item consumption'}};
      expect(await new ServerTurnService(hot,resolver).execute(owner,request)).toMatchObject({status:'accepted',duplicate:false});
    }
    expect(checks).toHaveLength(turns);
    // First check in this process is a forced full audit; later ones use the documented interval.
    expect(checks[0]).toMatchObject({interval:1,fullAudit:true,hashedEvents:0});
    expect(checks.slice(1).every(check=>check.interval===EVENT_CHAIN_FULL_AUDIT_EVERY)).toBe(true);
    for(const [index,check] of checks.entries()){
      expect(check.headSequence).toBe(index-1);
      // Incremental: re-hash the recorded head plus the single event appended by the previous turn.
      if(!check.fullAudit)expect(check.hashedEvents).toBeLessThanOrEqual(2);
      else expect(check.hashedEvents).toBe(index);
    }
    const fullAudits=checks.filter(check=>check.fullAudit).length;
    expect(fullAudits).toBe(1+Math.floor((turns-1)/EVENT_CHAIN_FULL_AUDIT_EVERY));
    const hashed=checks.reduce((sum,check)=>sum+check.hashedEvents,0);
    const fullEveryTurn=turns*(turns-1)/2;
    console.info(JSON.stringify({eventChainHashing:{turns,hashedIncremental:hashed,hashedIfFullEveryTurn:fullEveryTurn,fullAudits}}));
    expect(hashed).toBeLessThan(fullEveryTurn/10);
    expect((await pool.query('SELECT verified_sequence FROM turn_event_chain_checkpoints WHERE save_id=$1',[id])).rows[0].verified_sequence).toBe(turns-2);

    const tamper=await pool.connect();
    try{
      // Bring the checkpoint up to the real head (149) so the head row is the anchor.
      expect(await verifyTurnEventChain(tamper,id)).toMatchObject({ok:true,fullAudit:false,hashedEvents:2,headSequence:turns-1});
      const inTransaction=async(body:()=>Promise<void>)=>{await tamper.query('BEGIN');try{await body();}finally{await tamper.query('ROLLBACK');}};
      // Historic row rewritten in place (hash column kept): the full audit catches it.
      await inTransaction(async()=>{
        await tamper.query("SET LOCAL session_replication_role=replica");
        await tamper.query("UPDATE turn_events SET payload=jsonb_set(payload,'{tampered}','true') WHERE save_id=$1 AND sequence=40",[id]);
        expect((await tamper.query('SELECT verify_turn_event_chain($1) AS ok',[id])).rows[0].ok).toBe(false);
        expect(await verifyTurnEventChain(tamper,id,1)).toMatchObject({ok:false,fullAudit:true});
        // The periodic audit picks it up even without a forced audit.
        await tamper.query('UPDATE turn_event_chain_checkpoints SET incremental_checks=$2 WHERE save_id=$1',[id,EVENT_CHAIN_FULL_AUDIT_EVERY-1]);
        expect(await verifyTurnEventChain(tamper,id)).toMatchObject({ok:false,fullAudit:true});
      });
      // Recorded head rewritten in place: the very next incremental check fails.
      await inTransaction(async()=>{
        await tamper.query("SET LOCAL session_replication_role=replica");
        await tamper.query("UPDATE turn_events SET payload=jsonb_set(payload,'{tampered}','true') WHERE save_id=$1 AND sequence=$2",[id,turns-1]);
        expect(await verifyTurnEventChain(tamper,id)).toMatchObject({ok:false,fullAudit:false});
      });
      // Recorded head deleted (tail truncation): the stateless chain still looks valid, the checkpoint does not.
      await inTransaction(async()=>{
        await tamper.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
        await tamper.query('DELETE FROM turn_events WHERE save_id=$1 AND sequence=$2',[id,turns-1]);
        expect((await tamper.query('SELECT verify_turn_event_chain($1) AS ok',[id])).rows[0].ok).toBe(true);
        expect(await verifyTurnEventChain(tamper,id)).toMatchObject({ok:false,fullAudit:false});
        expect(await verifyTurnEventChain(tamper,id,1)).toMatchObject({ok:false,fullAudit:true});
      });
      // A failed check never advances the checkpoint, so the save keeps failing in the API.
      await inTransaction(async()=>{
        await tamper.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
        await tamper.query('DELETE FROM turn_events WHERE save_id=$1 AND sequence=$2',[id,turns-1]);
        for(let attempt=0;attempt<3;attempt++)expect((await verifyTurnEventChain(tamper,id)).ok).toBe(false);
        expect((await tamper.query('SELECT verified_sequence FROM turn_event_chain_checkpoints WHERE save_id=$1',[id])).rows[0].verified_sequence).toBe(turns-1);
      });
    }finally{tamper.release();}
    // Untampered data still verifies, both ways.
    expect(await verifyTurnEventChain(pool,id,1)).toMatchObject({ok:true,fullAudit:true,hashedEvents:turns});
    expect(await hot.loadSave(owner,id)).toMatchObject({revision:turns});
  },60000);
});
