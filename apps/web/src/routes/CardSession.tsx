import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CardHttpError, CardImportClient, cardError, type HistoryItem, type RequestItem, type SessionItem, type GroupMember, type GroupHistoryItem } from '../card-import-client';
import { GameShell } from '../components/GameShell';
import './card-ui.css';

type Props = { owner: string; sessionId: string; onBack: () => void };
export function CardSession(props: Props) { return <CardSessionForOwner key={`${props.owner}:${props.sessionId}`} {...props} />; }
function CardSessionForOwner({ owner, sessionId, onBack }: Props) {
  const controller = useMemo(() => new AbortController(), []);
  const api = useMemo(() => new CardImportClient(owner, controller.signal), [owner, controller]);
  const [session, setSession] = useState<SessionItem | null>(null), [history, setHistory] = useState<HistoryItem[]>([]);
  const [members,setMembers]=useState<GroupMember[]|null>(null),[groupHistory,setGroupHistory]=useState<GroupHistoryItem[]>([]),[strategy,setStrategy]=useState<'manual'|'auto'>('manual'),[mode,setMode]=useState<'manual'|'auto'|'multi'>('manual'),[speakers,setSpeakers]=useState<string[]>([]);
  const [opening, setOpening] = useState('');
  const [text, setText] = useState(''), [pending, setPending] = useState<{ key: string; action: string; revision: number; status: RequestItem['status']; error?: string | null } | null>(null);
  const [recoveryBlocked,setRecoveryBlocked]=useState(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('正在读取会话……');
  const ignorePosition = useCallback(() => {}, []);
  const pendingKey=`jx-card-pending:${location.origin}:${import.meta.env.VITE_API_BASE_URL||'/api'}:${owner}:${sessionId}`;
  const clearPending=()=>{try{sessionStorage.removeItem(pendingKey);}catch{/* result can still be queried */}};
  async function load() {
    const current = await api.session(sessionId);
    let group:GroupMember[]|null=null;try{group=await api.group(sessionId);}catch(e){if(!(e instanceof CardHttpError&&e.code==='NOT_GROUP_SESSION'))throw e;}
    let cursor=0;const rows:HistoryItem[]=[];const segments:GroupHistoryItem[]=[];
    if(group){const setting=await api.groupStrategy(sessionId);if(!controller.signal.aborted){setStrategy(setting.strategy);setMode(setting.strategy);setMembers(group);setSpeakers(old=>old.filter(id=>group!.some(x=>x.id===id)));}
      for(let page=0;page<11;page++){const next=await api.groupHistory(sessionId,cursor);let max=cursor;for(const row of next){if(!Number.isSafeInteger(row.resulting_revision)||row.resulting_revision<=cursor||!group.some(x=>x.id===row.participant_id))throw Error('INVALID_CARD_HISTORY');max=Math.max(max,row.resulting_revision);segments.push(row);}const turns=new Set(next.map(x=>x.resulting_revision)).size;cursor=max;if(turns<100)break;if(page===10)throw Error('INVALID_CARD_HISTORY');}
    }else{if(!controller.signal.aborted)setMembers(null);for(let page=0;page<11;page++){const next=await api.history(sessionId,cursor);for(const row of next){if(!Number.isSafeInteger(row.resulting_revision)||row.resulting_revision<=cursor)throw Error('INVALID_CARD_HISTORY');cursor=row.resulting_revision;rows.push(row);}if(next.length<100)break;if(page===10)throw Error('INVALID_CARD_HISTORY');}}
    const greeting = typeof current.greeting === 'string' ? current.greeting : '';
    if (!controller.signal.aborted) { setSession(current); setHistory(rows);setGroupHistory(segments);setOpening(greeting); }
  }
  useEffect(() => { void (async()=>{await load(); let saved: {key:string;action:string;revision:number;status:RequestItem['status']}|null=null;try {const raw=sessionStorage.getItem(pendingKey);if(raw){const v=JSON.parse(raw);if(typeof v.key==='string'&&typeof v.action==='string'&&Number.isSafeInteger(v.revision))saved={...v,status:'unknown'};else throw Error();}}catch{if(!controller.signal.aborted)setMessage('无法读取待核实请求，请先核对服务器请求记录。');setRecoveryBlocked(true);return;} if(saved){const status=await api.requestStatus(sessionId,saved.key);if(controller.signal.aborted)return;setRecoveryBlocked(false);if(status.status==='completed'){clearPending();await load();setMessage('已恢复已完成的行动。');}else {setPending({...saved,status:status.status,error:status.error??null});setText(saved.action);setMessage('已恢复原请求，请查询后再操作。');}return;} const recent=await api.requests(sessionId);const waiting=recent.filter(x=>x.status==='pending');if(controller.signal.aborted)return;if(waiting.length===1){setRecoveryBlocked(false);const x=waiting[0]!;setPending({key:x.key,action:x.action,revision:x.expected_revision,status:'pending'});setText(x.action);setMessage('发现待处理请求，请核对原请求。');}else if(waiting.length>1){setRecoveryBlocked(true);setMessage('发现多个待核实请求，请联系管理员核对；请勿重复提交。');}else {setRecoveryBlocked(false);setMessage('会话已读取；如有更早的未知请求，请先核实。');}})().catch(e=>{if(!controller.signal.aborted)setMessage(cardError(e));}); return () => controller.abort(); }, [api, controller, sessionId]);
  useEffect(() => {
    if (!pending || pending.status === 'failed') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  async function apply(result: RequestItem, current: NonNullable<typeof pending>) {
    if (!['unknown', 'pending', 'completed', 'failed'].includes(result.status) || result.key !== current.key) throw new Error('INVALID_CARD_RESPONSE');
    if (result.status === 'completed') { await load(); clearPending(); setPending(null); setText(''); setMessage('行动已完成，历史已更新。'); }
    else { setPending({ ...current, status: result.status, error: result.error ?? null }); setMessage(result.status === 'failed' ? `行动未完成：${result.error ? cardError(new CardHttpError(400,result.error)) : '生成失败'} 可由你决定是否重新提交。` : result.status === 'unknown' ? '服务端尚未确认这次请求；请保留当前页面并继续查询，不要创建新请求。' : '行动仍在处理；请继续查询。'); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!session || pending || busy || recoveryBlocked || !text.trim()) return;
    if(members && ((mode==='manual'&&speakers.length!==1)||(mode==='multi'&&(speakers.length<2||speakers.length>3)))){setMessage('请选择所需的群聊参与角色。');return;}
    const current = { key: crypto.randomUUID(), action: text, revision: session.revision, status: 'unknown' as const };
    try{sessionStorage.setItem(pendingKey,JSON.stringify(current));}catch{setMessage('本机无法保存请求标识，未提交行动。');return;}
    setPending(current); setBusy(true); setMessage('正在提交行动……');
    try { await apply(members ? await api.groupAction(sessionId,{idempotencyKey:current.key,expectedRevision:current.revision,action:current.action,mode,participantIds:mode==='auto'?[]:speakers}) : await api.action(sessionId, { idempotencyKey: current.key, expectedRevision: current.revision, action: current.action }), current); }
    catch (e) {
      if (!controller.signal.aborted) {
        // These responses occur before the candidate records a new request.
        if (e instanceof CardHttpError && ['MODEL_NOT_CONFIGURED', 'RATE_LIMITED', 'AUTH_REQUIRED', 'ACCOUNT_MISMATCH', 'ORIGIN_REJECTED', 'REVISION_CONFLICT'].includes(e.code || '')) { clearPending(); setPending(null); setMessage(cardError(e)); if (e.code === 'REVISION_CONFLICT') await load().catch(() => {}); }
        else { setMessage(`${cardError(e)} 本次结果未知，请查询原请求。`); }
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function query(recover: boolean) {
    if (!pending || busy) return; setBusy(true);
    try { await apply(recover ? await api.recover(sessionId, pending.key) : await api.requestStatus(sessionId, pending.key), pending); }
    catch (e) { if (!controller.signal.aborted) setMessage(cardError(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function back() { if (pending && pending.status !== 'failed' && !window.confirm('当前请求尚未确认。原请求标识已保存在本标签页，返回后请查询；离开不会撤销已提交的行动。仍要离开吗？')) return; onBack(); }
  return <GameShell saveId={`card-${sessionId}`} readingReady={!!session} readingScope={`card:${owner}:${sessionId}`} onReadingPositionChange={ignorePosition}>
    <header className="game-topline card-session-heading"><div><h1>{members?'角色卡群聊':'角色卡会话'}</h1><span>独立会话 · 修订 {session?.revision ?? '—'}</span></div><button className="secondary" onClick={back}>返回卡库</button></header>
    <div className="game-workspace card-session"><div className={`story-column${members?' card-group-column':''}`}>
      <div className="story-reading" role="region" tabIndex={0} aria-label="角色卡会话历史"><p role="status" className="card-session-status">{message}</p>
        {members && <section className="card card-ui-section" aria-label="群聊参与者"><h2>参与角色</h2><p>{members.map(m=>`${m.display_name||'未命名角色'} · ${m.id.slice(0,8)}`).join('、')}</p><p>默认策略：{strategy==='auto'?'自动轮流':'手动指定'}</p><div className="actions"><button type="button" disabled={busy||!!pending} onClick={()=>void (async()=>{try{const next=strategy==='manual'?'auto':'manual';const saved=await api.setGroupStrategy(sessionId,next);if(!controller.signal.aborted){setStrategy(saved.strategy);setMode(saved.strategy);}}catch(e){if(!controller.signal.aborted)setMessage(cardError(e));}})()}>切换默认策略</button></div></section>}
        {opening && <section className="card card-session-turn" data-reading-id="card-opening"><h2>开场</h2><p>{opening}</p></section>}
        {!(members?groupHistory.length:history.length) && session && <p>还没有完成的行动。</p>}
        {history.map(row => <section className="card card-session-turn" key={row.key} data-reading-id={row.key}><h2>行动 {row.resulting_revision}</h2><p>{row.action}</p><h3>剧情</h3><p>{row.narrative}</p></section>)}
        {members && groupHistory.map((row,index)=><section className="card card-session-turn" key={`${row.key}:${row.ordinal}`} data-reading-id={`${row.key}:${row.ordinal}`}>{(index===0||groupHistory[index-1]?.key!==row.key)&&<><h2>行动 {row.resulting_revision}</h2><p>{row.action}</p></>}<h3>{members.find(x=>x.id===row.participant_id)?.display_name||'未命名角色'} · {row.participant_id.slice(0,8)}</h3><p>{row.body}</p></section>)}
        {pending && <section className="card card-session-pending" aria-label="待核实行动"><p>请求状态：{pending.status}。{pending.status === 'failed' ? '此请求已失败。' : '请勿刷新或离开页面。'}</p>
          {pending.status !== 'failed' ? <div className="actions"><button disabled={busy} onClick={() => void query(false)}>查询原请求</button><button disabled={busy} onClick={() => void query(true)}>核对过期请求</button></div> : <button disabled={busy} onClick={() => { clearPending(); setPending(null); setMessage('可以修改行动并主动再次提交。'); }}>准备新行动</button>}</section>}
      </div>
      {members && <div className="card-ui-form card-group-controls"><label>本次发言方式<select value={mode} disabled={busy||!!pending} onChange={e=>{setMode(e.target.value as 'manual'|'auto'|'multi');setSpeakers([]);}}><option value="manual">手动指定</option><option value="auto">自动轮流</option><option value="multi">多角色一起回复</option></select></label>{mode!=='auto'&&<div role="group" aria-label="选择发言角色">{members.map(m=><label className="card-ui-check" key={m.id}><input type={mode==='manual'?'radio':'checkbox'} name="card-speaker" checked={speakers.includes(m.id)} disabled={busy||!!pending} onChange={e=>setSpeakers(old=>mode==='manual'?[m.id]:e.target.checked?[...old,m.id]:old.filter(id=>id!==m.id))}/>{m.display_name||'未命名角色'} · {m.id.slice(0,8)}</label>)}</div>}</div>}
      <form className="intent-composer" onSubmit={e => void submit(e)}><label htmlFor="card-action">你要做什么？</label><textarea id="card-action" aria-label="角色卡行动" value={text} maxLength={8000} onChange={e => setText(e.target.value)} disabled={!session || busy || !!pending || recoveryBlocked} /><button className="primary" type="submit" disabled={!session || busy || !!pending || recoveryBlocked || !text.trim()}>{busy ? '处理中…' : '提交行动'}</button></form>
    </div></div>
  </GameShell>;
}
