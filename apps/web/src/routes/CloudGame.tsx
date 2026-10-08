import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DecisionV2Schema, SaveEnvelopeSchema, TurnReceiptSchema, type DecisionV2, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import { CloudHttpError, cloudRequest } from '../cloud-sync';
import { createIdempotencyKey } from '../storage';
import { formatReceiptDelta, projectReceiptEvents } from '../receipt-event-view';
import { buildGameplayBrief, textForClarificationCandidate, type BriefAction } from '../gameplay-brief';

type ActionSuggestion = BriefAction;
type TurnPhase = 'idle' | 'submitting' | 'narrating' | 'retryable';
type PendingTurn = { text: string; expectedRevision: number; clarificationOf?: string; idempotencyKey: string };
type ClarifyDecisionV2 = Extract<DecisionV2, { status: 'clarify' }>;
const ACTION_GROUPS = [
  ['move', '移动'], ['observe', '观察'], ['talk', '交谈'], ['use_item', '使用物品'], ['combat', '战斗'],
] as const;
const SLOT_LABELS: Readonly<Record<string, string>> = {
  action: '想做什么', destinationId: '想去哪里', targetId: '要观察什么', npcId: '想和谁说',
  utterance: '想说什么', itemId: '要使用什么',
};

function messageFor(error: unknown): string {
  const code = error instanceof CloudHttpError ? error.code : undefined;
  if (error instanceof CloudHttpError && error.status === 401) return '需要有效的游客或邮箱会话。请恢复对应账号后继续读取这份服务端存档。';
  if (code === 'RULES_NOT_READY') return '服务器规则运行时尚未就绪。存档仍保留，当前没有结算行动。';
  if (code === 'REVISION_CONFLICT') return '这份存档已在另一处推进。已重新读取最新状态，请核对后再行动。';
  if (code === 'VERSION_MISMATCH') return '存档绑定的规则或 Canon 版本与服务器不一致，已停止提交。';
  if (code === 'CLARIFICATION_CONFLICT') return '这条澄清已过期；世界状态没有因这次提交而改变。请读取最新简报后重试。';
  if (code === 'NOT_FOUND') return '账号下没有这份服务端存档。';
  return '服务端请求未完成。请确认网络后重试；未收到回执的行动不会显示为已提交。';
}

function narrativeFailureText(value: unknown): string {
  const code = value && typeof value === 'object' && 'code' in value ? value.code : undefined;
  if (code === 'NARRATIVE_TIMEOUT') return '规则已提交，叙述等待超时。可以重试叙述，世界状态不会再次结算。';
  if (code === 'NARRATIVE_CANCELLED') return '规则已提交，叙述请求已取消。回执仍然有效，可以再次叙述。';
  return '规则已提交，叙述暂不可用。可以重试叙述，世界状态不会再次结算。';
}

function parseClarifyV2(value: unknown): ClarifyDecisionV2 | null {
  const parsed = DecisionV2Schema.safeParse(value);
  return parsed.success && parsed.data.status === 'clarify' ? parsed.data : null;
}

export function CloudGame({ saveId, onBack, onHome, onLogin }: { saveId: string; onBack: () => void; onHome: () => void; onLogin: () => void }) {
  const [save, setSave] = useState<SaveEnvelope | null>(null);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [receipt, setReceipt] = useState<TurnReceipt | null>(null);
  const [narrative, setNarrative] = useState('');
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<TurnPhase>('idle');
  const [notFound, setNotFound] = useState(false);
  const [notice, setNotice] = useState('正在读取服务端存档……');
  const [narrativeStatus, setNarrativeStatus] = useState<string | null>(null);
  const [clarificationOf, setClarificationOf] = useState<string | undefined>();
  const actionInput = useRef<HTMLTextAreaElement>(null);
  const pendingTurn = useRef<PendingTurn | null>(null);
  const busy = phase === 'submitting' || phase === 'narrating';

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
    try {
      const latest = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/latest-turn`);
      const restored = latest.receipt ? TurnReceiptSchema.parse(latest.receipt) : null;
      setReceipt(restored);
      setNarrative('');
      setNarrativeStatus(typeof latest.narrativeStatus === 'string' ? latest.narrativeStatus : null);
      setClarificationOf(restored?.decision.status === 'clarify' && 'interactionId' in restored.decision && typeof restored.decision.interactionId === 'string'
        ? restored.decision.interactionId : undefined);
    } catch {
      setReceipt(null);
      setNarrativeStatus(null);
    }
    return next;
  }, [saveId]);

  useEffect(() => {
    let active = true;
    void refresh().then(() => { if (active) setNotice('服务端存档已恢复。行动、澄清和快捷提交共用服务器解析与规则事务。'); })
      .catch(error => {
        if (!active) return;
        setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
        setNotice(messageFor(error));
      });
    return () => { active = false; };
  }, [refresh]);

  async function narrateCommittedTurn(target: TurnReceipt) {
    if (target.decision.status !== 'accepted') return;
    setPhase('narrating');
    setNotice(`规则已提交至修订 ${target.resultingRevision}。状态回执已到达；正在依据该回执叙述，不会再次结算。`);
    try {
      const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/turns/${encodeURIComponent(target.idempotencyKey)}/narrative`, 'POST', {});
      const returnedReceipt = TurnReceiptSchema.parse(result.receipt);
      if (returnedReceipt.idempotencyKey !== target.idempotencyKey || returnedReceipt.resultingRevision !== target.resultingRevision) {
        throw new Error('INVALID_NARRATIVE_RECEIPT');
      }
      const resultNarrative = result.narrative && typeof result.narrative === 'object'
        ? result.narrative as Record<string, unknown> : undefined;
      if (resultNarrative?.status === 'received' && typeof resultNarrative.text === 'string') {
        setNarrative(resultNarrative.text);
        setNarrativeStatus('received');
        setPhase('idle');
        setNotice(`规则已提交至修订 ${target.resultingRevision}；叙述来自已提交回执。`);
      } else {
        setNarrativeStatus('unavailable');
        setPhase('retryable');
        setNotice(narrativeFailureText(resultNarrative));
      }
    } catch (error) {
      setNarrativeStatus('unavailable');
      setPhase('retryable');
      setNotice(narrativeFailureText(error));
    }
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const utterance = text.trim();
    if (!save || !utterance || busy) return;
    const old = pendingTurn.current;
    const pending = old && old.text === utterance && old.expectedRevision === save.revision && old.clarificationOf === clarificationOf
      ? old
      : { text: utterance, expectedRevision: save.revision, ...(clarificationOf ? { clarificationOf } : {}), idempotencyKey: createIdempotencyKey() };
    pendingTurn.current = pending;
    setPhase('submitting');
    setNarrative('');
    setNotice('正在等待服务器解析和规则回执；收到回执前，世界状态尚未确认。');
    try {
      const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/turns`, 'POST', {
        text: pending.text,
        expectedRevision: pending.expectedRevision,
        idempotencyKey: pending.idempotencyKey,
        ...(pending.clarificationOf ? { clarificationOf: pending.clarificationOf } : {}),
        requestNarrative: false,
      });
      const nextReceipt = TurnReceiptSchema.parse(result.receipt);
      pendingTurn.current = null;
      setReceipt(nextReceipt);
      const decision = nextReceipt.decision;
      if (decision.status === 'clarify') {
        const detailedClarification = parseClarifyV2(decision);
        setClarificationOf(detailedClarification?.interactionId);
        setNarrative(decision.question);
        setPhase('idle');
        setNotice(!detailedClarification
          ? '澄清回执已保存；没有写入事件或推进时间。请编辑行动后再提交。'
          : detailedClarification.missingSlots.length
            ? `需要补充：${detailedClarification.missingSlots.map(slot => SLOT_LABELS[slot] ?? `信息（${slot}）`).join('、')}。没有写入事件或推进时间。`
            : detailedClarification.candidates.length
              ? '这句话对应多个当前可见行动。请选择一个候选，再检查并编辑文本后提交。当前没有结算。'
              : '尚不能把这句话对应到已知行动。原文已安全引用；请选择下方可执行示例或改写。当前没有结算。');
        await refresh().catch(() => undefined);
        setPhase('idle');
        return;
      }
      setClarificationOf(undefined);
      if (decision.status === 'rejected') {
        setNarrative(decision.message);
        setPhase('idle');
        setNotice(`行动未获接受；当前修订仍为 ${decision.revision}。没有写入事件。`);
        await refresh().catch(() => undefined);
        setPhase('idle');
        return;
      }

      setText('');
      setPhase('narrating');
      setNotice(`规则已提交至修订 ${nextReceipt.resultingRevision}。状态回执已到达；正在请求叙述。`);
      await refresh().catch(() => undefined);
      await narrateCommittedTurn(nextReceipt);
    } catch (error) {
      if (error instanceof CloudHttpError && error.code === 'REVISION_CONFLICT') {
        pendingTurn.current = null;
        setPhase('idle');
        setNotice(messageFor(error));
        try { await refresh(); } catch { /* Keep the conflict message if refresh also fails. */ }
      } else {
        // Keep the same key for a retry after a lost response. The server may
        // already have committed it, and its receipt is the only safe answer.
        setPhase('idle');
        setNotice(messageFor(error));
      }
    }
  }

  function onActionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function chooseSuggestion(item: ActionSuggestion) {
    setText(item.text);
    actionInput.current?.focus();
  }

  const eventRows = projectReceiptEvents(receipt);
  const brief = save ? buildGameplayBrief(save, receipt, suggestions) : null;
  const clarifyDecision = receipt?.decision.status === 'clarify' ? parseClarifyV2(receipt.decision) : null;
  const groupedActions = ACTION_GROUPS.map(([kind, label]) => ({ kind, label, items: suggestions.filter(item => item.kind === kind) }));
  return <section className="page cloud-game" data-testid="p2-cloud-game" data-phase={phase}>
    <header className="cloud-game-heading"><div><span className="eyebrow">服务端规则存档</span><h2>行旅</h2></div><button className="secondary" onClick={onBack}>返回山门</button></header>
    <p role="status" data-testid="p2-status" aria-live="polite">{notice}</p>
    {!save && !notFound && <div className="card"><p>存档尚未载入。请用创建时的游客或邮箱会话恢复。</p><button className="primary" onClick={onLogin}>账号与云档</button></div>}
    {notFound && <div className="card"><h2>找不到这份存档</h2><p>账号下没有这份服务端存档，或链接来自另一个账号。</p><button className="primary" onClick={onHome}>回到首页</button></div>}
    {save && brief && <>
      <section className="card cloud-game-state" aria-label="服务端存档状态">
        <p>修订 <strong data-testid="p2-revision">{save.revision}</strong></p>
        <p>游戏分钟 <strong data-testid="p2-game-minute">{typeof save.state.facts.gameMinute === 'number' ? save.state.facts.gameMinute : '未记录'}</strong></p>
        <p>记忆模式 <strong>{save.schemaVersion === 3 && save.memoryMode === 'forgetting' ? '真实遗忘' : save.schemaVersion === 3 && save.memoryMode === 'continue' ? '存档与继续' : '旧版存档'}</strong></p>
        <p>规则版本 <code>{save.ruleVersion}</code></p>
      </section>

      <section className="card" aria-label="世界简报" data-testid="p3-world-brief">
        <h3>行旅简报</h3>
        <p>当前地点：<strong>{brief.currentLocation}</strong></p>
        <p>上次停留：<strong>{brief.lastStop}</strong>（按最近一次已提交存档读取）</p>
        <p data-testid="p3-recent-record">{brief.recentRecord}</p>
        <p data-testid="p3-quest-status">{brief.questStatus}</p>
        <p>{brief.offlineProgress}</p>
        {brief.nextAction && <p>可接着做：<button className="quiet-action" data-testid="p3-hook" disabled={busy} onClick={() => chooseSuggestion(brief.nextAction!)}>{brief.nextAction.label}</button>。依据：修订 {save.revision} 的当前可见行动建议。</p>}
      </section>

      <section className="card" aria-label="当前可尝试的行动" data-testid="p3-suggestions">
        <h3>行动建议 · 点击后仍可编辑</h3>
        {groupedActions.map(group => <div key={group.kind}>
          <h4>{group.label}</h4>
          {group.items.length
            ? <div className="actions">{group.items.map(item => <button className="secondary" key={item.id} disabled={busy} onClick={() => chooseSuggestion(item)}>{item.label}</button>)}</div>
            : <p>当前状态下暂无可验证的此类行动建议。</p>}
        </div>)}
      </section>

      {receipt?.decision.status === 'clarify' && <section className="card" aria-label="行动澄清" data-testid="p3-clarification">
        <h3>先把行动说清楚</h3>
        <p>{receipt.decision.question}</p>
        {!!clarifyDecision && <>
        {'missingSlots' in clarifyDecision && clarifyDecision.missingSlots.length > 0 &&
          <p>还需要：{clarifyDecision.missingSlots.map(slot => SLOT_LABELS[slot] ?? `信息（${slot}）`).join('、')}。</p>}
        {clarifyDecision.candidates.length > 0 && <div className="actions" aria-label="候选行动">{clarifyDecision.candidates.map((candidate, index) =>
          <button className="secondary" key={`${candidate.kind}:${candidate.label}:${index}`} disabled={busy} onClick={() => {
            setText(textForClarificationCandidate(candidate, suggestions));
            setClarificationOf(clarifyDecision.interactionId);
            actionInput.current?.focus();
          }}>{candidate.label}</button>)}</div>}
        {clarifyDecision.missingSlots.length === 0 && clarifyDecision.candidates.length === 0 && <>
          {text.trim() && <blockquote data-testid="p3-unknown-quote">你写的是：“{text.trim()}”</blockquote>}
          <p>可接受示例：</p>
          <div className="actions">{suggestions.slice(0, 4).map(item => <button className="secondary" key={`example:${item.id}`} disabled={busy} onClick={() => {
            setText(item.text); setClarificationOf(clarifyDecision.interactionId); actionInput.current?.focus();
          }}>{item.label}</button>)}</div>
        </>}
        </>}
        <p>澄清回执未推进游戏时间，也没有写入世界事件。编辑下方文字后再次提交。</p>
      </section>}

      <form className="card cloud-game-action" onSubmit={event => void submit(event)}>
        <label htmlFor="p2-action-input">你要做什么？</label>
        <textarea ref={actionInput} id="p2-action-input" data-testid="p2-action-input" value={text} maxLength={8_000}
          onChange={event => setText(event.target.value)} onKeyDown={onActionKeyDown} disabled={busy}
          aria-describedby="p3-action-shortcut" />
        <small id="p3-action-shortcut">Ctrl+Enter 或 ⌘+Enter 提交；快捷键与按钮使用同一解析入口。</small>
        <button className="primary" data-testid="p2-submit-action" disabled={busy || !text.trim()}>{phase === 'submitting' ? '等待规则回执…' : '提交行动'}</button>
      </form>

      {!!narrative && <section className="card" aria-label="行动叙述"><h3>发生了什么</h3><p data-testid="p2-narrative">{narrative}</p></section>}
      {receipt?.decision.status === 'accepted' && !narrative && !busy && <section className="card" aria-label="恢复叙述">
        <p>叙述正文不写入权威存档；规则事件和状态回执已恢复。需要时可按同一回执重新叙述。</p>
        <button className="secondary" data-testid="p3-retry-narrative" disabled={busy} onClick={() => void narrateCommittedTurn(receipt)}>重新叙述最近结果</button>
      </section>}
      {!!receipt && <section className="card" data-testid="p2-receipt" aria-label="状态回执">
        <h3>状态回执</h3>
        <p>请求：<code>{receipt.idempotencyKey}</code> · 修订 {receipt.resultingRevision}</p>
        <p>裁决：{receipt.decision.status}</p>
        {eventRows.length ? <ul>{eventRows.map(event => <li key={event.eventId}>
          {event.eventType} · 事件修订 {event.stateRevision}{event.delta ? ` · ${formatReceiptDelta(event.delta)}` : ''}
        </li>)}</ul> : <p>无事件提交；世界修订未前进。</p>}
        {narrativeStatus && <p>叙述记录状态：{narrativeStatus}</p>}
      </section>}
    </>}
  </section>;
}
