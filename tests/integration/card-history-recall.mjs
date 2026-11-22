import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Called only inside card-real-play's disposable cluster and loopback protocol server.
export async function verifyHistoryRecall({pool, login, http, makeCard, session, mount, config,
  context, page, origin, seen, mark, setReply}) {
  const player = await login(`recall-${randomUUID()}@example.invalid`);
  const other = await login(`other-${randomUUID()}@example.invalid`);
  const api = (path, method='GET', body) => http('/api/card-import' + path, method, body, player.cookie);
  const model = {...config, approvalId:'synthetic-recall-'+randomUUID(), allowedOwners:[player.owner]};
  mount(model);
  const binding = (await api('/model')).body.binding;
  const card = await makeCard('船长', player, null);
  const second = await makeCard('药师', player, null);
  const persona = (await api('/personas','POST',{id:randomUUID(),name:'信使',description:'虚构角色',extensions:{}})).body;
  const id = await session(card, player, persona.id);
  const post = (sid,rev,action,group) => {
    const body = {expectedRevision:rev, idempotencyKey:randomUUID(), modelBinding:binding, action, ...group};
    return api(`/sessions/${sid}/${group?'group-actions':'actions'}`, 'POST', body);
  };
  // Only uneventful intervening turns are seeded. Sources, corrections and probes go through HTTP.
  async function ordinary(sid, first, last, speaker) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rows = (await client.query(`INSERT INTO card_import.requests
        (owner_id,session_id,key,fingerprint,expected_revision,action,status,narrative,resulting_revision,expires_at)
        SELECT $1,$2,gen_random_uuid(),'fixture',n-1,'寻常航行 '||n,'completed','天色如常。',n,now()
        FROM generate_series($3::int,$4::int) n RETURNING key`,[player.owner,sid,first,last])).rows;
      if (speaker) {
        const keys = rows.map(row=>row.key);
        await client.query(`INSERT INTO card_import.group_turns(owner_id,session_id,key,mode,selected)
          SELECT $1,$2,k,'manual',$4::jsonb FROM unnest($3::uuid[]) k`,[player.owner,sid,keys,JSON.stringify([speaker])]);
        await client.query(`INSERT INTO card_import.group_messages(owner_id,session_id,key,ordinal,participant_id,body)
          SELECT $1,$2,k,0,$4,'天色如常。' FROM unnest($3::uuid[]) k`,[player.owner,sid,keys,speaker]);
      }
      assert.equal((await client.query('UPDATE card_import.sessions SET revision=$3 WHERE owner_id=$1 AND id=$2 AND revision=$4',
        [player.owner,sid,last,first-1])).rowCount,1);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally {client.release();}
  }
  const quote = '我承诺：七夕归还铜铃。';
  setReply(quote);
  const source = (await post(id,0,'请给我一个承诺。')).body;
  assert.equal(source.narrative,quote);
  setReply('灯火如常。');
  const sibling = await session(card, player, null);
  assert.equal((await post(sibling,0,'目标：仅限另一会话的罗盘。')).body.status,'completed');
  await ordinary(id,2,55);
  // Remount and reload with the real login cookie before submitting turn 56.
  mount(model);
  await context.clearCookies();
  await context.addCookies([{name:'jx_session',value:player.cookie.slice('jx_session='.length),url:origin,httpOnly:true}]);
  await page.goto(origin+'/cards/session/'+id);
  await page.getByLabel('角色卡行动').waitFor();
  await page.reload();
  await page.getByText(quote,{exact:true}).waitFor();
  const posted = page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/actions'));
  await page.getByLabel('角色卡行动').fill('forest · 我们以前约好归还什么？');
  await page.getByRole('button',{name:'提交行动',exact:true}).click();
  const response = await posted;
  const request = response.request().postDataJSON(), done = await response.json();
  assert.equal(done.resulting_revision,56);
  const data = () => JSON.parse(seen.at(-1).messages[1].content);
  assert.deepEqual(data().untrusted_history_quotes,[{sessionId:id,revision:1,key:source.key,source:'character',topic:'承诺',quote}]);
  assert.equal(data().player_persona.name,'信使');
  assert.equal(data().character.name,'船长');
  assert.ok(data().world_before_character.includes('CHAR_BOOK_MARKER'));
  assert.ok(!JSON.stringify(seen.at(-1)).includes('另一会话的罗盘'));
  assert.equal((await http('/api/card-import/sessions/'+id+'/history','GET',undefined,other.cookie)).status,404);
  mark('INPUT_PASS turn 56 receives the exact turn 1 character quote, provenance, persona and lore after reload');
  const count = seen.length;
  assert.equal((await api(`/sessions/${id}/requests/${request.idempotencyKey}`)).body.key,done.key);
  assert.equal((await api(`/sessions/${id}/actions`,'POST',request)).body.resulting_revision,56);
  const history = (await api('/sessions/'+id+'/history?after=0')).body;
  assert.equal(history.length,56); assert.equal(history[0].narrative,quote); assert.equal(seen.length,count);
  mark('PERSISTENCE_PASS same-key lookup/replay and source history survive re-entry without another send');
  const update = '更正承诺：中秋归还玉笛。';
  const corrected = (await post(id,56,update)).body;
  assert.equal(corrected.resulting_revision,57);
  assert.ok(!JSON.stringify(seen.at(-1)).includes(quote));
  await ordinary(id,58,108);
  assert.equal((await post(id,108,'还记得我们的约定吗？')).body.status,'completed');
  assert.deepEqual(data().untrusted_history_quotes,[{sessionId:id,revision:57,key:corrected.key,source:'player',topic:'承诺',quote:update}]);
  assert.ok(!JSON.stringify(seen.at(-1)).includes(quote));
  mark('INPUT_PASS correction supersedes the old promise immediately and beyond the history window');

  const relation = '关系：我们是同门。';
  const relationship = (await post(id,109,relation)).body;
  assert.equal(relationship.resulting_revision,110);
  await ordinary(id,111,162);
  assert.equal((await post(id,162,'我们是什么关系？')).body.status,'completed');
  assert.deepEqual(data().untrusted_history_quotes.map(q=>[q.revision,q.topic,q.quote]), [
    [110,'关系',relation],[57,'承诺',update],
  ]);
  assert.equal((await post(id,163,'更正：以前的记录暂不采用。')).body.status,'completed');
  assert.equal(data().untrusted_history_quotes,undefined);
  await ordinary(id,165,215);
  assert.equal((await post(id,215,'再看看旧记录。')).body.status,'completed');
  assert.equal(data().untrusted_history_quotes,undefined);
  mark('INPUT_PASS relationship recall is ranked first; unqualified correction suppresses obsolete quotes');

  const gid=randomUUID();
  assert.equal((await api('/group-sessions','POST',{id:gid,cardIds:[card,second],personaVersionId:null})).status,200);
  const members=(await api('/sessions/'+gid+'/group')).body;
  const manual={mode:'manual',participantIds:[members[0].id]};
  setReply('我承诺：私藏的黑石只归船长。');
  assert.equal((await post(gid,0,'目标：不公开的暗号。',manual)).body.status,'completed');
  setReply('灯火如常。');
  const shared='共同目标：一起抵达白港。';
  const publicTurn=(await post(gid,1,shared,manual)).body;
  await ordinary(gid,3,55,members[0].id);
  for(const [i,group] of [{mode:'manual',participantIds:[members[1].id]},
    {mode:'multi',participantIds:members.map(m=>m.id)}].entries()) {
    assert.equal((await post(gid,55+i,'我们的共同目标是什么？',group)).body.status,'completed');
    assert.deepEqual(data().untrusted_history_quotes,[{sessionId:gid,revision:2,key:publicTurn.key,source:'player',topic:'目标',quote:shared}]);
    assert.doesNotMatch(JSON.stringify(seen.at(-1)),/私藏的黑石|不公开的暗号|玉笛|铜铃/);
  }
  mark('INPUT_PASS group recall sends only the explicitly shared original to another speaker and multi');

  // Exercise all three fixes in the same budgeted provider request, with B selected first.
  const selectedIds = [members[1].id, members[0].id];
  const before = seen.length;
  const result = await post(gid,57,'我们的共同目标是什么？',{
    mode:'multi', participantIds:selectedIds, requireAllSelected:true,
  });
  assert.equal(result.body.resulting_revision,58);
  assert.equal(seen.length,before+1);
  const wire = seen.at(-1).messages;
  assert.equal(wire[0].role,'developer');
  assert.match(wire[0].content,/各回复恰好一次/);
  for (const id of selectedIds) assert.ok(wire[0].content.includes(id));
  assert.equal(data().character.name,members[1].display_name);
  assert.deepEqual(JSON.parse(wire.find(m=>m.role==='assistant').content),[
    {participantId:members[0].id,text:members[0].display_name+' opening'},
  ]);
  assert.deepEqual(data().untrusted_history_quotes,[{sessionId:gid,revision:2,key:publicTurn.key,source:'player',topic:'目标',quote:shared}]);
  assert.doesNotMatch(JSON.stringify(wire),/私藏的黑石|不公开的暗号/);
  const saved = (await api('/sessions/'+gid+'/group-history?after=57')).body;
  assert.deepEqual(saved.map(row=>[row.key,row.participant_id]),selectedIds.map(id=>[result.body.key,id]));
  mark('INTEGRATION_PASS strict multi retains opener attribution and authorized recall in one wire request and commits both speakers');
}
