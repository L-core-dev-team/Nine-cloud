import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CardImportClient, cardError, type CardItem, type ImportItem, type SessionItem, type PersonaItem } from '../card-import-client';
import { GameInfoDialog } from '../components/GameShell';
import { ReadableData } from '../components/ReadableData';
import './card-ui.css';

type Props = { owner: string; onSession: (id: string) => void; onBack: () => void };
export function CardLibrary(props: Props) { return <CardLibraryForOwner key={props.owner} {...props} />; }
function CardLibraryForOwner({ owner, onSession, onBack }: Props) {
  const controller = useMemo(() => new AbortController(), []);
  const api = useMemo(() => new CardImportClient(owner, controller.signal), [owner, controller]);
  const [imports, setImports] = useState<ImportItem[]>([]), [cards, setCards] = useState<CardItem[]>([]), [sessions, setSessions] = useState<SessionItem[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [personas,setPersonas]=useState<PersonaItem[]>([]), [query,setQuery]=useState(''), [chosenCard,setChosenCard]=useState<CardItem|null>(null), [persona,setPersona]=useState(''), [greetingIndex,setGreetingIndex]=useState(-1), [recursive,setRecursive]=useState(false);
  const [selected, setSelected] = useState<ImportItem | null>(null), [detail, setDetail] = useState<CardItem | null>(null);
  const [file, setFile] = useState<File | null>(null), [kind, setKind] = useState<'card' | 'worldbook' | 'attachment'>('card');
  const [rights, setRights] = useState(false), [source, setSource] = useState(''), [notes, setNotes] = useState(''), [parent, setParent] = useState('');
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [extraImport, setExtraImport] = useState(''), [extraUri, setExtraUri] = useState('');
  const [message, setMessage] = useState('正在读取角色卡资料……'), [busy, setBusy] = useState(false);
  const [pendingSession, setPendingSession] = useState<{ id: string; cardId: string; options:{personaVersionId?:string|null;greetingIndex:number;recursiveWorldbook:boolean} } | null>(null);
  async function refresh() { const [a, b, c, d] = await Promise.all([api.imports(), api.library(query), api.sessions(),api.personas()]); if(controller.signal.aborted)return; setImports(a); setCards(b.items);setNextCursor(b.nextCursor); setSessions(c); setPersonas(d); }
  useEffect(() => { void refresh().then(() => setMessage('角色卡资料已读取。')).catch(e => { if (!controller.signal.aborted) setMessage(cardError(e)); }); return () => controller.abort(); }, [api, controller]);
  async function run(task: () => Promise<void>) { if (busy) return; setBusy(true); try { await task(); } catch (e) { if (!controller.signal.aborted) setMessage(cardError(e)); } finally { if (!controller.signal.aborted) setBusy(false); } }
  function select(item: ImportItem) { setSelected(item); setSource(''); setNotes(''); setParent(''); setBindings({}); setExtraImport(''); setExtraUri(''); }
  function upload(event: FormEvent) { event.preventDefault(); if (!file || !rights) return; void run(async () => { const item = await api.upload(file, kind); select(item); await refresh(); setMessage(item.error ? `文件已保存，但识别失败：${item.error}` : item.duplicate ? '相同文件已存在，已显示原导入结果。' : '文件已保存，请核对识别结果。'); }); }
  function confirm() { if (!selected?.parsed || selected.kind !== 'card') return; void run(async () => {
    const refs = selected.parsed!.assetRefs;
    if (refs.some(uri => !bindings[uri])) { setMessage('请为每个资源地址选择导入文件。'); return; }
    if (!!extraImport !== !!extraUri.trim()) { setMessage('附加资料需要同时选择文件和填写绑定名称。'); return; }
    const links = refs.map(uri => ({ uri, importId: bindings[uri]! }));
    if (extraImport) links.push({ uri: extraUri.trim(), importId: extraImport });
    if (new Set(links.map(link => link.uri)).size !== links.length) { setMessage('绑定名称不能重复。'); return; }
    await api.confirm({ importId: selected.id, parentId: parent || null, source, notes, links }); await refresh(); setMessage('角色卡版本已确认保存。');
  }); }
  function remove(type: 'imports' | 'cards' | 'sessions', id: string) { if (!window.confirm('确定删除这项资料？会话删除也会删除其历史，无法撤销。')) return; void run(async () => { await api.remove(type, id); if (selected?.id === id) setSelected(null); if (detail?.id === id) setDetail(null); await refresh(); setMessage('已删除。'); }); }
  function create(cardId: string) { if (pendingSession && pendingSession.cardId !== cardId) return; const attempt = pendingSession ?? { id: crypto.randomUUID(), cardId, options:{personaVersionId:persona||null,greetingIndex,recursiveWorldbook:recursive} }; setPendingSession(attempt); void run(async () => { const session = await api.createSession(attempt.id, attempt.cardId, attempt.options); if (!controller.signal.aborted) { setPendingSession(null); onSession(session.id); } }); }
  function download(id: string) { void run(async () => { const bytes = await api.original(id); const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })); const a = document.createElement('a'); a.href = url; a.download = 'original.bin'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('已下载原文件。'); }); }
  const attachments = imports.filter(item => item.kind !== 'card' && !item.error);
  const cardName = (card: CardItem) => card.name || imports.find(item => item.id === card.import_id)?.filename || card.id;
  return <section className="card-library" aria-label="角色卡资料库">
    <header className="card-ui-heading"><div><h1>角色卡资料库</h1><p>导入、核对并保存角色卡，或继续独立会话。</p></div><button className="secondary" onClick={onBack}>返回</button></header>
    <p role="status" className="card-ui-status">{message}</p>
    <section className="card card-ui-section"><h2>导入文件</h2><p>提交后原文件会保存到服务器；请先确认你有权使用。每个文件最多 8 MiB。</p>
      <form onSubmit={upload} className="card-ui-form"><label>文件类型<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setFile(null); setRights(false); }} disabled={busy}><option value="card">角色卡 PNG / JSON</option><option value="worldbook">世界书 JSON</option><option value="attachment">附件</option></select></label>
      <label>选择文件<input key={kind} type="file" accept={kind === 'card' ? '.png,.json' : kind === 'worldbook' ? '.json' : undefined} onChange={e => { setFile(e.currentTarget.files?.[0] ?? null); setRights(false); }} disabled={busy} /></label>
      <label className="card-ui-check"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} disabled={busy} />我确认有权上传并使用此文件。</label><button className="primary" disabled={busy || !file || !rights}>上传并核对</button></form>
    </section>
    {selected && <section className="card card-ui-section" aria-label="导入核对"><h2>核对：{selected.filename}</h2><p>原文件已保存。{selected.duplicate ? '这是已有导入。' : ''}</p>{selected.error ? <p role="alert">识别失败：{selected.error}</p> : selected.parsed && <><p>{selected.parsed.format} · {selected.parsed.name || '未命名'}；外部内容仅按文本展示。</p><GamePreview value={selected.parsed.document} />
      {selected.kind === 'card' && <div className="card-ui-form"><label>来源<input maxLength={2048} value={source} onChange={e => setSource(e.target.value)} /></label><label>备注<textarea maxLength={8000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <label>作为已有卡片的新版本<select value={parent} onChange={e => setParent(e.target.value)}><option value="">新卡片</option>{cards.map(card => <option key={card.id} value={card.id}>{cardName(card)} · {card.id.slice(0, 8)}</option>)}</select></label>
      {selected.parsed.assetRefs.map((uri, index) => <label key={`${index}-${uri}`}>资源地址（仅显示）：<code>{uri}</code><select value={bindings[uri] || ''} onChange={e => setBindings({ ...bindings, [uri]: e.target.value })}><option value="">选择已导入附件</option>{attachments.map(item => <option value={item.id} key={item.id}>{item.filename}</option>)}</select></label>)}
      <label>附加世界书或附件<select value={extraImport} onChange={e => setExtraImport(e.target.value)}><option value="">不附加</option>{attachments.map(item => <option value={item.id} key={item.id}>{item.filename}</option>)}</select></label><label>附加资料绑定名称<input value={extraUri} maxLength={2048} onChange={e => setExtraUri(e.target.value)} /></label>
      <button className="primary" disabled={busy} onClick={confirm}>确认并保存版本</button></div>}</>}
      <button className="secondary" disabled={busy} onClick={() => download(selected.id)}>下载原文件</button>
    </section>}
    <section className="card card-ui-section"><h2>已保存卡片</h2><label>搜索卡片<input value={query} onChange={e=>setQuery(e.target.value)} /></label><button disabled={busy} onClick={()=>void run(async()=>{const page=await api.library(query);setCards(page.items);setNextCursor(page.nextCursor);})}>搜索</button>{!cards.length && <p>还没有保存的卡片。</p>}<ul className="card-ui-list">{cards.map(card => <li key={card.id}><span>{cardName(card)} · {card.id.slice(0, 8)}{card.parent_id ? ' · 新版本' : ''}</span><div className="actions"><button disabled={busy} onClick={() => void run(async () => setDetail(await api.card(card.id)))}>查看</button><button disabled={busy || (!!pendingSession && pendingSession.cardId !== card.id)} onClick={() => void run(async()=>{const detail=await api.card(card.id);setChosenCard(detail);setPersona('');setGreetingIndex(-1);setRecursive(false);})}>{pendingSession?.cardId === card.id ? '核对并继续创建' : '开始会话'}</button><button disabled={busy} onClick={() => remove('cards', card.id)}>删除</button></div></li>)}</ul>{nextCursor && <button disabled={busy} onClick={()=>void run(async()=>{const page=await api.library(query,nextCursor);setCards(old=>[...old,...page.items]);setNextCursor(page.nextCursor);})}>加载更多</button>}{pendingSession && <p role="status">建局结果尚未确认；再次点击将使用同一会话标识。刷新后请先检查会话列表。</p>}</section>
    {chosenCard && <section className="card card-ui-section" aria-label="创建角色卡会话"><h2>创建会话</h2><div className="card-ui-form">
      <label>玩家身份<select value={persona} onChange={e=>setPersona(e.target.value)}><option value="">不使用 Persona</option>{personas.map(p=><option key={p.version_id} value={p.version_id}>{p.name}{p.is_default?'（默认）':''}</option>)}</select></label>
      <label>开场<select value={greetingIndex} onChange={e=>setGreetingIndex(Number(e.target.value))}><option value={-1}>原开场</option>{(()=>{const doc=chosenCard.parsed?.document; const d=doc?.data && typeof doc.data==='object'&&!Array.isArray(doc.data)?doc.data as Record<string,unknown>:doc;return Array.isArray(d?.alternate_greetings)?d.alternate_greetings.map((v,i)=>typeof v==='string'?<option key={i} value={i}>{`备用 ${i+1}：${v.slice(0,60)}`}</option>:null):null;})()}</select></label>
      <label className="card-ui-check"><input type="checkbox" checked={recursive} onChange={e=>setRecursive(e.target.checked)} />启用世界书递归</label>
      <button className="primary" disabled={busy} onClick={()=>create(chosenCard.id)}>确认创建</button><button type="button" onClick={()=>setChosenCard(null)}>取消</button></div></section>}
    <section className="card card-ui-section"><h2>会话</h2>{!sessions.length && <p>暂无会话。</p>}<ul className="card-ui-list">{sessions.map(session => <li key={session.id}><span>会话 {session.id} · 修订 {session.revision}</span><div className="actions"><button disabled={busy} onClick={() => onSession(session.id)}>继续</button><button disabled={busy} onClick={() => remove('sessions', session.id)}>删除</button></div></li>)}</ul></section>
    <section className="card card-ui-section"><h2>导入记录</h2>{!imports.length && <p>暂无导入记录。</p>}<ul className="card-ui-list">{imports.map(item => <li key={item.id}><span>{item.filename} · {item.kind}{item.error ? ` · ${item.error}` : ''}</span><div className="actions"><button disabled={busy} onClick={() => void run(async () => select(await api.import(item.id)))}>核对</button><button disabled={busy} onClick={() => download(item.id)}>下载原文件</button><button disabled={busy} onClick={() => remove('imports', item.id)}>删除</button></div></li>)}</ul></section>
    {detail && <GameInfoDialog label="角色卡资料" onClose={() => setDetail(null)}><p>卡片 {detail.id}</p><GamePreview value={detail.parsed?.document} /></GameInfoDialog>}
  </section>;
}
function GamePreview({ value }: { value: unknown }) { return <details><summary>查看解析资料（部分字段可能折叠或截断）</summary><ReadableData value={value} /></details>; }
