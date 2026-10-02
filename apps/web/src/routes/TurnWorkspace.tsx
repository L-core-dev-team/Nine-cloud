import { useEffect, useRef, useState } from 'react';
import { SaveEnvelopeSchema, StateDeltaSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import { cloudRequest, CloudHttpError } from '../cloud-sync';
import { IndexedTurnStore, TurnClient, type PendingTurn } from '../turn-client';

const client = new TurnClient(new IndexedTurnStore());
export function TurnWorkspace({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const [owner, setOwner] = useState(''); const [saves, setSaves] = useState<SaveEnvelope[]>([]);
  const [selected, setSelected] = useState(''); const [pending, setPending] = useState<PendingTurn | null>(null);
  const [text, setText] = useState(''); const [message, setMessage] = useState('正在核对会话……');
  const [busy, setBusy] = useState(false); const [narrative, setNarrative] = useState('');
  const lock = useRef(false); const alive = useRef(true);
  const generation = useRef<AbortController | null>(null);
  const current = saves.find(save => save.saveId === selected);
  const changes = pending?.receipt?.decision.status === 'accepted' ? pending.receipt.decision.events.map(event => StateDeltaSchema.safeParse(event.payload.stateDelta)).filter(result => result.success).map(result => result.data) : [];
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
  async function run(narrate = false) {
    if (lock.current || !current) return; lock.current = true; setBusy(true);
    try {
      let record = pending;
      if (narrate) {
        if (!record) throw new Error('TURN_NOT_COMMITTED'); setMessage('规则结果已提交，正在生成叙事……');
        const controller = new AbortController(); generation.current = controller;
        const result = await client.narrate(record, controller.signal); if (alive.current) { setNarrative(result); setMessage('叙事完成；规则状态未重新结算。'); } return;
      }
      if (!record || record.phase === 'confirmed') {
        if (!text.trim()) { setMessage('请填写行动意图。'); return; }
        record = await client.prepare(owner, { kind: 'free_text', saveId: current.saveId, actorId: current.state.playerId,
          expectedRevision: current.revision, idempotencyKey: crypto.randomUUID(), payload: { text: text.trim() } });
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
    <p>本地待处理行动和云端备份不会自动转为权威状态。规则未配置时，服务端拒绝结算。</p>
    {!owner && <button onClick={onLogin}>登录云端账号</button>}
    <label>权威存档<select disabled={busy} value={selected} onChange={event => setSelected(event.target.value)}><option value="">请选择</option>{saves.map(save => <option key={save.saveId} value={save.saveId}>{save.saveId}</option>)}</select></label>
    {current && <p>地点：{current.state.locationId} · 版本：{current.revision} · 已经过：{current.state.elapsedMinutes} 分钟</p>}
    <label>行动意图<textarea maxLength={4000} value={text} disabled={busy || Boolean(pending && pending.phase !== 'confirmed')} onChange={event => setText(event.target.value)} /></label>
    <button disabled={!current || busy} onClick={() => { void run(); }}>{pending && pending.phase !== 'confirmed' ? '恢复核对原请求' : '提交行动'}</button>
    <button disabled={busy || pending?.receipt?.decision.status !== 'accepted'} onClick={() => { void run(true); }}>生成或重试叙事</button>
    {busy && generation.current && <button onClick={() => generation.current?.abort()}>取消叙事生成</button>}
    <p role="status" aria-live="polite">{message}</p>
    {pending?.receipt?.decision.status === 'rejected' && <p>行动未通过：{pending.receipt.decision.message}</p>}
    {pending?.receipt?.decision.status === 'clarify' && <p>需要补充：{pending.receipt.decision.question}</p>}
    {changes.length > 0 && <section aria-label="结算变化"><h2>结算变化</h2>{changes.map((delta,index) => <div key={index}><p>时间推进：{delta.timeChange} 分钟</p>{delta.locationChange && <p>地点：{delta.locationChange.before} → {delta.locationChange.after}</p>}{delta.factChanges.map(change => <p key={change.key}>{change.key}：{change.before.present ? JSON.stringify(change.before.value) : '无'} → {change.after.present ? JSON.stringify(change.after.value) : '移除'}</p>)}</div>)}</section>}
    {pending && <p>请求：{pending.intent.idempotencyKey} · {pending.phase === 'confirmed' ? '回执已确认' : '待核对，尚不能判断是否结算'}</p>}
    {narrative && <article className="story-message narration"><p>{narrative}</p></article>}
  </section>;
}
