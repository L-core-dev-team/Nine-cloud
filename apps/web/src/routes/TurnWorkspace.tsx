import { pageNarrator } from '../page-narrative';
import { useEffect, useRef, useState } from 'react';
import { SaveEnvelopeSchema, type SaveEnvelope,type ActionIntent } from '@jiuxiao/contracts';
import { cloudRequest, CloudHttpError } from '../cloud-sync';
import { IndexedTurnStore, TurnClient, type PendingTurn } from '../turn-client';
import {createAuthoritativeGame} from '../game-creation';
import {buildActionDraft} from '../action-draft';
import { projectReceiptEvents } from '../receipt-event-view';

const client = new TurnClient(new IndexedTurnStore());
type EditableActionSuggestion = { id: string; kind: 'move'|'observe'|'talk'|'use_item'|'combat'; label: string; text: string };
export function TurnWorkspace({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const [owner, setOwner] = useState(''); const [saves, setSaves] = useState<SaveEnvelope[]>([]);
  const [selected, setSelected] = useState(''); const [pending, setPending] = useState<PendingTurn | null>(null);
  const [text, setText] = useState(''); const [message, setMessage] = useState('正在核对会话……');
  const [busy, setBusy] = useState(false); const [narrative, setNarrative] = useState('');
  const [suggestions,setSuggestions]=useState<EditableActionSuggestion[]>([]);
  const lock = useRef(false); const alive = useRef(true);
  const generation = useRef<AbortController | null>(null);
  const [newName,setNewName]=useState('');const [newGoal,setNewGoal]=useState('');
  const [kind,setKind]=useState<ActionIntent['kind']>('free_text');const [target,setTarget]=useState('');const [secondary,setSecondary]=useState('');const [amount,setAmount]=useState(1);
  const current = saves.find(save => save.saveId === selected);
  const changes = projectReceiptEvents(pending?.receipt);
  useEffect(() => { let active = true; alive.current = true; void (async () => {
    try {
      const session = await cloudRequest('/api/auth/session'); const account = session.account as { id?: unknown };
      if (typeof account?.id !== 'string') throw new Error('INVALID_SESSION');
      const response = await cloudRequest('/api/saves', 'GET', undefined, account.id);
      if (!Array.isArray(response.saves)) throw new Error('INVALID_SAVES');
      const owned = response.saves.map(value => SaveEnvelopeSchema.parse(value)).filter(save => save.state.facts.archiveKind !== 'local-untrusted-v1');
      if (active) { setOwner(account.id); setSaves(owned); setMessage(owned.length ? '请选择服务端权威存档。' : '尚无服务端权威存档。正式规则和建档内容待作者提供，本地旧档保持原样。'); }
    } catch { if (active) setMessage('请先登录云端账号；服务未开启时本地游戏资料仍可使用。'); }
  })(); return () => { active = false; alive.current = false; generation.current?.abort(); }; }, []);
  useEffect(() => { let active = true; setPending(null); setNarrative('');
    if (owner && selected) void client.read(owner, selected).then(value => { if (active) setPending(value); }).catch(() => { if (active) setMessage('回合恢复记录无法读取，未发送行动。'); });
    return () => { active = false; };
  }, [owner, selected]);
  useEffect(() => { let active=true; setSuggestions([]);
    if(owner&&current){
      void cloudRequest(`/api/games/${encodeURIComponent(current.saveId)}/action-suggestions`,'GET',undefined,owner)
        .then(response=>{
          const rows=Array.isArray(response.actions)?response.actions:[];
          const safe=rows.filter((row):row is EditableActionSuggestion=>!!row&&typeof row==='object'&&
            typeof (row as EditableActionSuggestion).id==='string'&&typeof (row as EditableActionSuggestion).label==='string'&&
            typeof (row as EditableActionSuggestion).text==='string'&&['move','observe','talk','use_item','combat'].includes((row as EditableActionSuggestion).kind)&&
            (row as EditableActionSuggestion).label.length<=160&&(row as EditableActionSuggestion).text.length<=4000);
          if(active)setSuggestions(safe.slice(0,32));
        }).catch(()=>{if(active)setSuggestions([]);});
    }
    return()=>{active=false;};
  },[owner,selected,current?.revision]);
  async function createGame(){
    if(lock.current||!owner)return;lock.current=true;setBusy(true);setMessage('正在创建或恢复核对权威新局……');
    try{const save=await createAuthoritativeGame(owner,{name:newName.trim(),goal:newGoal.trim()});if(alive.current){setSaves(rows=>[...rows.filter(row=>row.saveId!==save.saveId),save]);setSelected(save.saveId);setMessage('权威新局已确认，可以提交行动。');}}
    catch(error){if(alive.current)setMessage(error instanceof CloudHttpError&&error.code==='RULES_NOT_READY'?'作者规则或建档内容尚未接入，未创建新局。':'建档未确认；再次点击会核对原请求，不重复创建。');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function run(narrate = false) {
    if (lock.current || !current) return; lock.current = true; setBusy(true);
    try {
      let record = pending;
      if (narrate) {
        if (!record) throw new Error('TURN_NOT_COMMITTED'); setMessage('规则结果已提交，正在生成叙事……');
        const controller = new AbortController(); generation.current = controller;
        const result = await client.narrate(record, controller.signal, pageNarrator()); if (alive.current) { setNarrative(result); setMessage('叙事完成；规则状态未重新结算。'); } return;
      }
      if (!record || record.phase === 'confirmed') {
        let intent:ActionIntent;
        try{intent=buildActionDraft({saveId:current.saveId,actorId:current.state.playerId,expectedRevision:current.revision,idempotencyKey:crypto.randomUUID()},kind,{text,target,secondary,amount});}
        catch{setMessage('请补齐此类行动所需的目标、内容或正整数数量。');return;}
        record = await client.prepare(owner,intent);
      }
      if (alive.current) { setPending(record); setMessage('正在核对并提交规则结果……'); }
      const confirmed = await client.submit(record);
      if (alive.current) { setPending(confirmed); setText(''); setMessage(confirmed.receipt?.decision.status === 'accepted' ? '权威结果已确认，可单独生成叙事。' : '规则已返回拒绝或待澄清决定，状态未推进。'); }
      const fresh = SaveEnvelopeSchema.parse((await cloudRequest(`/api/saves/${encodeURIComponent(current.saveId)}`, 'GET', undefined, owner)).save);
      if (alive.current) setSaves(rows => rows.map(row => row.saveId === fresh.saveId ? fresh : row));
    } catch (error) {
      if (!alive.current) return;
      const restored = await client.read(owner, current.saveId).catch(() => null);
      if (!alive.current) return; setPending(restored);
      setMessage(error instanceof CloudHttpError && error.status === 401 ? '会话已失效或账号已切换。原请求保留，请登录原账号后核对。' : restored?.phase === 'confirmed' ? '回执已确认。叙事或状态刷新未完成，可重试；不会重复结算。' : '服务未就绪或结果尚未确认。原请求已保留；恢复时核对原请求，不会创建新的结算请求。');
    } finally { generation.current = null; lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="settings-page cloud-page turn-workspace" aria-label="权威回合工作区">
    <button className="quiet-action" onClick={onBack}>返回</button><h1>回合处理</h1>
    <p>本地待处理行动和云端备份不会自动转为权威状态。规则未配置时，服务端拒绝结算。建议行动来自当前权威状态；选中后仍可编辑。</p>
    {!owner && <button onClick={onLogin}>登录云端账号</button>}
    {owner&&<details><summary>创建或恢复权威新局</summary><label>姓名<input maxLength={80} disabled={busy} value={newName} onChange={e=>setNewName(e.target.value)}/></label><label>目标<input maxLength={500} disabled={busy} value={newGoal} onChange={e=>setNewGoal(e.target.value)}/></label><button disabled={busy} onClick={()=>void createGame()}>创建或核对新局</button></details>}
    <label>权威存档<select disabled={busy} value={selected} onChange={event => setSelected(event.target.value)}><option value="">请选择</option>{saves.map(save => <option key={save.saveId} value={save.saveId}>{save.saveId}</option>)}</select></label>
    {current && <p>地点：{current.state.locationId} · 版本：{current.revision} · 已经过：{current.state.elapsedMinutes} 分钟</p>}
    {current&&suggestions.length>0&&<section aria-label="根据当前可见状态生成的行动建议"><h2>你可以试试</h2><div className="action-suggestions">{suggestions.map(suggestion=><button type="button" key={suggestion.id} disabled={busy||Boolean(pending&&pending.phase!=='confirmed')} onClick={()=>{setKind('free_text');setTarget('');setSecondary('');setAmount(1);setText(suggestion.text);setMessage('建议已放入行动文本，可以继续修改。');}}>{suggestion.label}</button>)}</div></section>}
    <label>行动类别<select disabled={busy||Boolean(pending&&pending.phase!=='confirmed')} value={kind} onChange={e=>setKind(e.target.value as ActionIntent['kind'])}>{Object.entries({free_text:'行动意图',move:'移动',cultivate:'修炼',acquire_item:'获取物品',use_item:'使用物品',talk:'NPC 对话',combat:'基础战斗',quest:'任务'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {kind!=='free_text'&&<label>{kind==='move'?'目的地':kind==='cultivate'?'功法':kind==='talk'?'NPC':kind==='acquire_item'||kind==='use_item'?'物品':kind==='quest'?'任务':'战斗目标'}<input maxLength={200} disabled={busy||Boolean(pending&&pending.phase!=='confirmed')} value={target} onChange={e=>setTarget(e.target.value)}/></label>}
    {['use_item','combat','quest'].includes(kind)&&<label>{kind==='quest'?'任务选项':kind==='combat'?'使用功法（可选）':'使用目标（可选）'}<input maxLength={200} disabled={busy||Boolean(pending&&pending.phase!=='confirmed')} value={secondary} onChange={e=>setSecondary(e.target.value)}/></label>}
    {(kind==='cultivate'||kind==='acquire_item')&&<label>{kind==='cultivate'?'修炼分钟':'获取数量'}<input type="number" min="1" step="1" disabled={busy||Boolean(pending&&pending.phase!=='confirmed')} value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label>}
    <label>行动意图<textarea maxLength={4000} value={text} disabled={busy || Boolean(pending && pending.phase !== 'confirmed')} onChange={event => setText(event.target.value)} /></label>
    <button disabled={!current || busy} onClick={() => { void run(); }}>{pending && pending.phase !== 'confirmed' ? '恢复核对原请求' : '提交行动'}</button>
    <button disabled={busy || pending?.receipt?.decision.status !== 'accepted'} onClick={() => { void run(true); }}>生成或重试叙事</button>
    {busy && generation.current && <button onClick={() => generation.current?.abort()}>取消叙事生成</button>}
    <p role="status" aria-live="polite">{message}</p>
    {pending?.receipt?.decision.status === 'rejected' && <p>行动未通过：{pending.receipt.decision.message}</p>}
    {pending?.receipt?.decision.status === 'clarify' && <p>需要补充：{pending.receipt.decision.question}</p>}
    {changes.length > 0 && <section aria-label="结算变化"><h2>结算变化</h2>{changes.map(change => <article key={change.eventId} data-event-id={change.eventId} data-state-revision={change.stateRevision}><p>事件 {change.eventId} · 状态修订 {change.stateRevision}</p>{change.delta ? <><p>时间推进：{change.delta.timeChange} 分钟</p>{change.delta.locationChange && <p>地点：{change.delta.locationChange.before} → {change.delta.locationChange.after}</p>}{change.delta.factChanges.map(fact => <p key={fact.key}>{fact.key}：{fact.before.present ? JSON.stringify(fact.before.value) : '无'} → {fact.after.present ? JSON.stringify(fact.after.value) : '移除'}</p>)}</> : <p>此事件没有可展示的结构化状态差异。</p>}</article>)}</section>}
    {pending && <p>请求：{pending.intent.idempotencyKey} · {pending.phase === 'confirmed' ? '回执已确认' : '待核对，尚不能判断是否结算'}</p>}
    {narrative && <article className="story-message narration"><p>{narrative}</p></article>}
  </section>;
}
