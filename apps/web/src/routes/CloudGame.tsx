import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SaveEnvelopeSchema, TurnReceiptSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import { CloudHttpError, cloudRequest } from '../cloud-sync';
import { createIdempotencyKey } from '../storage';
import { formatReceiptDelta, projectReceiptEvents } from '../receipt-event-view';

type ActionSuggestion = { id: string; kind: string; label: string; text: string };

function messageFor(error: unknown): string {
  const code = error instanceof CloudHttpError ? error.code : undefined;
  if (error instanceof CloudHttpError && error.status === 401) return '需要有效的邮箱会话。登录后可继续读取这份服务端存档。';
  if (code === 'RULES_NOT_READY') return '服务器规则运行时尚未就绪。存档仍保留，当前没有结算行动。';
  if (code === 'REVISION_CONFLICT') return '这份存档已在另一处推进。已重新读取最新状态，请核对后再行动。';
  if (code === 'VERSION_MISMATCH') return '存档绑定的规则或 Canon 版本与服务器不一致，已停止提交。';
  if (code === 'NOT_FOUND') return '账号下没有这份服务端存档。';
  return '服务端请求未完成。请确认网络后重试；未确认的行动不会显示为已提交。';
}

export function CloudGame({ saveId, onBack, onHome, onLogin }: { saveId: string; onBack: () => void; onHome: () => void; onLogin: () => void }) {
  const [save, setSave] = useState<SaveEnvelope | null>(null);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [receipt, setReceipt] = useState<TurnReceipt | null>(null);
  const [narrative, setNarrative] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [notice, setNotice] = useState('正在读取服务端存档……');

  const refresh = useCallback(async () => {
    setNotFound(false);
    const response = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}`);
    const next = SaveEnvelopeSchema.parse(response.save);
    if (next.saveId !== saveId) throw new Error('INVALID_GAME_RESPONSE');
    setSave(next);
    try {
      const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/action-suggestions`);
      setSuggestions(Array.isArray(result.actions) ? result.actions.filter((value): value is ActionSuggestion =>
        !!value && typeof value === 'object' && typeof value.id === 'string' && typeof value.kind === 'string'
        && typeof value.label === 'string' && typeof value.text === 'string') : []);
    } catch (error) {
      setSuggestions([]);
      if (error instanceof CloudHttpError && error.code === 'RULES_NOT_READY') setNotice(messageFor(error));
    }
    return next;
  }, [saveId]);

  useEffect(() => {
    let active = true;
    void refresh().then(() => { if (active) setNotice('服务端存档已恢复。行动将由服务器规则结算。'); })
      .catch(error => {
        if (!active) return;
        setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
        setNotice(messageFor(error));
      });
    return () => { active = false; };
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const utterance = text.trim();
    if (!save || !utterance || busy) return;
    setBusy(true);
    setNotice('服务器正在解析行动并结算；只有提交后的状态回执会改变世界显示。');
    try {
      const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/turns`, 'POST', {
        text: utterance,
        expectedRevision: save.revision,
        idempotencyKey: createIdempotencyKey(),
        requestNarrative: true,
      });
      const nextReceipt = TurnReceiptSchema.parse(result.receipt);
      setReceipt(nextReceipt);
      const resultNarrative = result.narrative && typeof result.narrative === 'object'
        ? result.narrative as Record<string, unknown> : undefined;
      const decision = nextReceipt.decision;
      setNarrative(typeof resultNarrative?.text === 'string' ? resultNarrative.text
        : decision.status === 'clarify' ? decision.question
          : decision.status === 'rejected' ? decision.message : '行动已提交，状态回执已更新。');
      const next = await refresh();
      setText('');
      setNotice(decision.status === 'accepted'
        ? `规则已提交至修订 ${next.revision}。叙述只展示回执中的结果。`
        : decision.status === 'clarify' ? '澄清回执已保存；世界状态未推进。'
          : `行动未获接受；当前修订仍为 ${next.revision}。`);
    } catch (error) {
      if (error instanceof CloudHttpError && error.code === 'REVISION_CONFLICT') {
        setNotice(messageFor(error));
        try { await refresh(); } catch { /* Preserve the conflict message if refresh also fails. */ }
      } else setNotice(messageFor(error));
    } finally { setBusy(false); }
  }

  const eventRows = projectReceiptEvents(receipt);
  return <section className="page cloud-game" data-testid="p2-cloud-game">
    <header className="cloud-game-heading"><div><span className="eyebrow">服务端规则存档</span><h2>行旅</h2></div><button className="secondary" onClick={onBack}>返回山门</button></header>
    <p role="status" data-testid="p2-status">{notice}</p>
    {!save && !notFound && <div className="card"><p>存档尚未载入。需要已登录的邮箱会话。</p><button className="primary" onClick={onLogin}>账号与云档</button></div>}
    {notFound && <div className="card"><h2>找不到这份存档</h2><p>账号下没有这份服务端存档，或链接来自另一个账号。</p><button className="primary" onClick={onHome}>回到首页</button></div>}
    {save && <>
      <section className="card cloud-game-state" aria-label="服务端存档状态">
        <p>修订 <strong data-testid="p2-revision">{save.revision}</strong></p>
        <p>游戏分钟 <strong data-testid="p2-game-minute">{typeof save.state.facts.gameMinute === 'number' ? save.state.facts.gameMinute : '未记录'}</strong></p>
        <p>记忆模式 <strong>{save.schemaVersion === 3 && save.memoryMode === 'forgetting' ? '真实遗忘' : save.schemaVersion === 3 && save.memoryMode === 'continue' ? '存档与继续' : '旧版存档'}</strong></p>
        <p>规则版本 <code>{save.ruleVersion}</code></p>
      </section>
      {!!suggestions.length && <section className="card" aria-label="当前可尝试的行动"><h3>当前可尝试</h3><div className="actions">{suggestions.map(item => <button className="secondary" key={item.id} disabled={busy} onClick={() => setText(item.text)}>{item.label}</button>)}</div></section>}
      <form className="card cloud-game-action" onSubmit={submit}>
        <label htmlFor="p2-action-input">你要做什么？</label>
        <textarea id="p2-action-input" data-testid="p2-action-input" value={text} maxLength={8_000} onChange={event => setText(event.target.value)} disabled={busy} />
        <button className="primary" data-testid="p2-submit-action" disabled={busy || !text.trim()}>{busy ? '正在结算…' : '提交行动'}</button>
      </form>
      {!!narrative && <section className="card" aria-label="行动叙述"><h3>发生了什么</h3><p data-testid="p2-narrative">{narrative}</p></section>}
      {!!receipt && <section className="card" data-testid="p2-receipt" aria-label="状态回执">
        <h3>状态回执</h3>
        <p>请求：<code>{receipt.idempotencyKey}</code> · 修订 {receipt.resultingRevision}</p>
        <p>裁决：{receipt.decision.status}</p>
        {eventRows.length ? <ul>{eventRows.map(event => <li key={event.eventId}>
          {event.eventType} · 事件修订 {event.stateRevision}{event.delta ? ` · ${formatReceiptDelta(event.delta)}` : ''}
        </li>)}</ul> : <p>无事件提交；世界修订未前进。</p>}
      </section>}
    </>}
  </section>;
}
