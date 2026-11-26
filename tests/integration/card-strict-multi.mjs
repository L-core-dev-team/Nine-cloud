import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

// Uses the caller's disposable PG cluster, browser and loopback protocol transport.
export async function verifyStrictMulti({pool,http,page,context,origin,login,makeCard,config,mount,seen,mark,other,setReply}) {
  const owner = await login(`multi-${randomUUID()}@example.invalid`);
  const api = (path,method='GET',body) => http('/api/card-import'+path,method,body,owner.cookie);
  mount({...config, allowedOwners:[owner.owner], approvalId:'synthetic-multi-'+randomUUID()});
  const binding = (await api('/model')).body.binding;
  const cards = [];
  for (const name of ['舟娘','药师','使者']) cards.push(await makeCard(name,owner,null));
  const id = randomUUID(), path = '/sessions/'+id;
  assert.equal((await api('/group-sessions','POST',{id,cardIds:cards,personaVersionId:null})).status,200);
  const members = (await api(path+'/group')).body;
  const [a,b,c] = members.map(p => p.id);
  const groupHistory = async () => (await api(path+'/group-history')).body;
  const post = body => api(path+'/group-actions','POST',body);
  const make = (revision, ids=[a,b]) => ({mode:'multi',participantIds:ids,action:'渡口相会',expectedRevision:revision,
    idempotencyKey:randomUUID(),modelBinding:binding});
  const reply = (...ids) => JSON.stringify({messages:ids.map(participantId=>({participantId,text:'发言 '+participantId}))});

  const ordinary = make(0);
  setReply(reply(a,a));
  assert.equal((await post(ordinary)).body.status,'completed');
  assert.deepEqual((await groupHistory()).map(row=>row.participant_id),[a,a]);
  const legacyFingerprint = createHash('sha256').update(JSON.stringify({revision:0,action:ordinary.action,
    group:{mode:'multi',participantIds:[a,b]}})).digest('hex');
  assert.equal((await pool.query('SELECT fingerprint FROM card_import.requests WHERE owner_id=$1 AND session_id=$2 AND key=$3',
    [owner.owner,id,ordinary.idempotencyKey])).rows[0].fingerprint,legacyFingerprint);
  let before = seen.length;
  assert.equal((await post({...ordinary,requireAllSelected:false})).body.status,'completed');
  assert.equal((await post({...ordinary,requireAllSelected:true})).status,409);
  assert.equal(seen.length,before);
  mark('ordinary repeated speaker and original fingerprint preserved; strict change conflicts without sending');

  const original = {...make(1),requireAllSelected:true};
  setReply(reply(b,a));
  assert.equal((await post(original)).body.resulting_revision,2);
  assert.deepEqual((await groupHistory()).slice(-2).map(row=>row.participant_id),[b,a]);
  const instruction = seen.at(-1).messages[0];
  assert.equal(instruction.role,'developer');
  assert.match(instruction.content,/各回复恰好一次/);
  for (const participantId of [a,b]) assert.ok(instruction.content.includes(participantId));
  assert.ok(!instruction.content.includes(c));
  before=seen.length;
  assert.equal((await api(path+'/requests/'+original.idempotencyKey)).body.status,'completed');
  assert.equal((await post(original)).body.resulting_revision,2);
  assert.equal((await post({...original,requireAllSelected:false})).status,409);
  assert.equal(seen.length,before);
  mark('two strict speakers in model order, trusted ids and exact original key replay');

  const history = await groupHistory();
  for (const [output,error] of [
    [reply(a,a),'GROUP_OUTPUT_INCOMPLETE'],[reply(a),'GROUP_OUTPUT_INCOMPLETE'],
    [reply(a,b,b),'GROUP_OUTPUT_INCOMPLETE'],[reply(a,c),'GROUP_OUTPUT_INVALID'],
    [JSON.stringify({messages:[{participantId:a,text:'ok'},{participantId:b,text:' '}]}),'GROUP_OUTPUT_INVALID'],
    ['not JSON','GROUP_OUTPUT_INVALID'],
  ]) {
    setReply(output);
    const body={...make(2),requireAllSelected:true};
    const count=seen.length;
    const result=(await post(body)).body;
    assert.equal(result.status,'failed'); assert.equal(result.error,error);
    assert.equal((await post(body)).body.error,error);
    assert.equal((await api(path+'/requests/'+body.idempotencyKey)).body.error,error);
    assert.equal(seen.length,count+1);
    assert.equal((await api(path)).body.revision,2);
    assert.deepEqual(await groupHistory(),history);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM card_import.group_messages WHERE owner_id=$1 AND session_id=$2 AND key=$3',
      [owner.owner,id,body.idempotencyKey])).rows[0].n,0);
  }
  before=seen.length;
  for(const ids of [[a],[a,a],[a,randomUUID()],[a,b,c,a]]) {
    assert.equal((await post({...make(2,ids),requireAllSelected:true})).body.error,'INVALID_PARTICIPANTS');
  }
  assert.equal((await http('/api/card-import'+path+'/group-history','GET',undefined,other.cookie)).status,404);
  assert.equal((await http('/api/card-import'+path+'/group-actions','POST',{...make(2),requireAllSelected:true},other.cookie)).status,404);
  assert.equal(seen.length,before);
  mark('invalid strict outputs leave zero segment rows and unchanged revision; invalid selection and other account rejected');

  await context.clearCookies();
  await context.addCookies([{name:'jx_session',value:owner.cookie.slice('jx_session='.length),url:origin,httpOnly:true}]);
  await page.goto(origin+'/cards/session/'+id);
  await page.getByLabel('本次发言方式').selectOption('multi');
  const toggle=page.getByLabel('要求每个选中角色都回复');
  assert.equal(await toggle.isChecked(),false);
  await toggle.check();
  const checkboxes=page.getByRole('group',{name:'选择发言角色'}).getByRole('checkbox');
  for(let i=0;i<3;i++) await checkboxes.nth(i).check();
  await page.reload(); await toggle.waitFor();
  assert.equal(await toggle.isChecked(),true);
  for(let i=0;i<3;i++) assert.equal(await checkboxes.nth(i).isChecked(),true);
  setReply(reply(c,a,b));
  await page.getByLabel('角色卡行动').fill('三人各说一句。');
  const pending=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/group-actions'));
  await page.getByRole('button',{name:'提交行动',exact:true}).click();
  const response=await pending, payload=response.request().postDataJSON();
  assert.equal(payload.requireAllSelected,true);
  assert.deepEqual(payload.participantIds,[a,b,c]);
  assert.equal((await response.json()).resulting_revision,3);
  await page.getByText('行动已完成，历史已更新。',{exact:true}).waitFor();
  before=seen.length;
  await page.reload(); await page.getByText('三人各说一句。',{exact:true}).waitFor();
  const rows=(await groupHistory()).filter(r=>r.key===payload.idempotencyKey);
  assert.deepEqual(rows.map(r=>r.participant_id),[c,a,b]);
  for(const row of rows){
    const turn=page.locator('[data-reading-id="'+row.key+':'+row.ordinal+'"]');
    assert.ok((await turn.locator('h3').innerText()).includes(row.participant_id.slice(0,8)));
    assert.equal(await turn.getByText(row.body,{exact:true}).count(),1);
  }
  assert.equal(seen.length,before);
  mark('browser strict selection survives refresh and three attributed replies restore without sending');

  setReply('默认发言');
  const defaultBody={...make(3,[a])}; delete defaultBody.mode;
  await api(path+'/group-strategy','PUT',{strategy:'manual'});
  assert.equal((await post(defaultBody)).body.resulting_revision,4);
  await api(path+'/group-strategy','PUT',{strategy:'auto'});
  const automatic=make(4,[]); delete automatic.mode;
  assert.equal((await post(automatic)).body.resulting_revision,5);
  assert.deepEqual((await groupHistory()).slice(-2).map(r=>r.participant_id),[a,b]);
  mark('default manual and round-robin remain compatible');
  setReply(undefined);
}
