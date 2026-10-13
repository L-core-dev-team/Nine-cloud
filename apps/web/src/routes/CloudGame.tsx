import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SaveEnvelopeSchema, TurnReceiptSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import { CloudHttpError, cloudRequest } from '../cloud-sync';
import { createIdempotencyKey } from '../storage';
import { formatReceiptDelta, projectReceiptEvents } from '../receipt-event-view';
import { GameShell, GameInfoDialog } from '../components/GameShell';
import { cloudGameDiagnostic, cloudGameErrorPlan, type CloudGameNextStep } from './cloud-game-errors';

type ActionSuggestion = { id: string; kind: string; label: string; text: string };
type PendingTurn = { idempotencyKey: string; text: string; expectedRevision: number; clarificationOf?: string };
type RefreshOutcome = { rulesUnavailable: boolean; suggestionsUnavailable: boolean };
type CloudGameProps = { saveId: string; onBack: () => void; onHome: () => void; onLogin: () => void; onWorld: () => void };
const saveCannotBeRead = (error: unknown) => error instanceof CloudHttpError && (error.status === 401 || error.code === 'NOT_FOUND');

export function CloudGame(props: CloudGameProps) {
  return <CloudGameSession key={props.saveId} {...props} />;
}

function CloudGameSession({ saveId, onBack, onHome, onLogin, onWorld }: CloudGameProps) {
  const [showState, setShowState] = useState(false);
  const [save, setSave] = useState<SaveEnvelope | null>(null);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [receipt, setReceipt] = useState<TurnReceipt | null>(null);
  const [narrative, setNarrative] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(true);
  const [saveNeedsRefresh, setSaveNeedsRefresh] = useState(true);
  const [failure, setFailure] = useState<{ next: CloudGameNextStep; diagnostic: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rulesUnavailable, setRulesUnavailable] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const [notice, setNotice] = useState('正在读取服务端存档……');

  const refresh = useCallback(async () => {
    setNotFound(false);
    setSaveNeedsRefresh(true);
    let response: Record<string, unknown>;
    try { response = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}`); }
    catch (error) {
      if (saveCannotBeRead(error)) {
        setSave(null);
        setSuggestions([]);
        setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
      }
      throw error;
    }
    const next = SaveEnvelopeSchema.parse(response.save);
    if (next.saveId !== saveId) throw new Error('INVALID_GAME_RESPONSE');
    setSave(next);
    let nextRulesUnavailable = false;
    let nextSuggestionsUnavailable = false;
    try {
      const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/action-suggestions`);
      setSuggestions(Array.isArray(result.actions) ? result.actions.filter((value): value is ActionSuggestion =>
        !!value && typeof value === 'object' && typeof value.id === 'string' && typeof value.kind === 'string'
        && typeof value.label === 'string' && typeof value.text === 'string') : []);
    } catch (error) {
      setSuggestions([]);
      if (error instanceof CloudHttpError && error.code === 'RULES_NOT_READY') nextRulesUnavailable = true;
      else if (saveCannotBeRead(error)) {
        setSave(null);
        setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
        throw error;
      }
      else nextSuggestionsUnavailable = true;
    }
    setRulesUnavailable(nextRulesUnavailable);
    setSaveNeedsRefresh(false);
    return { save: next, rulesUnavailable: nextRulesUnavailable, suggestionsUnavailable: nextSuggestionsUnavailable } satisfies RefreshOutcome & { save: SaveEnvelope };
  }, [saveId]);

  useEffect(() => {
    let active = true;
    void refresh().then(outcome => {
      if (!active) return;
      setNotice(outcome.rulesUnavailable ? cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message
        : outcome.suggestionsUnavailable ? '存档已读取；当前无法读取行动建议，你仍可直接输入行动。'
          : '服务端存档已读取。提交后请以状态回执为准。');
    })
      .catch(error => {
        if (!active) return;
        setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
        setSave(null);
        setNotice(cloudGameErrorPlan(error).message);
        setFailure({ next: error instanceof CloudHttpError && error.status === 401 ? 'account' : 'reload', diagnostic: cloudGameDiagnostic(error) });
      }).finally(() => { if (active) setRefreshBusy(false); });
    return () => { active = false; };
  }, [refresh]);

  async function reloadSave() {
    if (refreshBusy || busy) return;
    setRefreshBusy(true);
    setNotice('正在重新读取存档状态……');
    try {
      const outcome = await refresh();
      setFailure(null);
      setNotice(outcome.rulesUnavailable ? cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message
        : outcome.suggestionsUnavailable ? '存档状态已更新；行动建议暂不可用，仍可直接输入。'
          : '存档状态已更新。请核对修订与回执后再继续。');
    } catch (error) {
      setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
      setNotice(cloudGameErrorPlan(error).message);
      const plan = cloudGameErrorPlan(error);
      setFailure({ next: plan.next === 'same-request' ? 'reload' : plan.next, diagnostic: cloudGameDiagnostic(error) });
    } finally { setRefreshBusy(false); }
  }

  async function sendTurn(request: PendingTurn, requestNarrative: boolean, recovering: boolean) {
    if (!save || busy || refreshBusy || save.saveId !== saveId || (!recovering && saveNeedsRefresh)) return;
    setBusy(true);
    setFailure(null);
    try {
      setNotice(recovering ? '正在用原请求编号核对状态回执……' : '正在提交行动并等待服务器回执……');
      let result: Record<string, unknown>;
      try {
        result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/turns`, 'POST', {
          text: request.text,
          expectedRevision: request.expectedRevision,
          idempotencyKey: request.idempotencyKey,
          ...(request.clarificationOf ? { clarificationOf: request.clarificationOf } : {}),
          requestNarrative,
        });
      } catch (error) {
        const plan = cloudGameErrorPlan(error);
        setFailure({ next: plan.next, diagnostic: cloudGameDiagnostic(error) });
        if (saveCannotBeRead(error)) {
          setSave(null);
          setSuggestions([]);
          setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
        }
        // A retry failing before settlement cannot disprove the original commit.
        // Retain its key until a matching receipt confirms the outcome.
        setPendingTurn(recovering || plan.next === 'same-request' ? request : null);
        if (error instanceof CloudHttpError && error.code === 'RULES_NOT_READY') setRulesUnavailable(true);
        if (error instanceof CloudHttpError && error.code === 'REVISION_CONFLICT') {
          setSaveNeedsRefresh(true);
          setReceipt(null);
          try {
            const outcome = await refresh();
            setFailure(null);
            setNotice(outcome.rulesUnavailable ? cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message
              : '这份存档已在别处更新。最新修订已读取；请核对后再继续。');
          } catch { setNotice(plan.message); }
        } else {
          if (plan.next === 'reload' || plan.next === 'account' || plan.next === 'home') setSaveNeedsRefresh(true);
          setNotice(recovering && error instanceof CloudHttpError && error.code === 'RULES_NOT_READY'
            ? '服务器规则尚未就绪，暂时无法核对原请求。之前的行动结果仍待确认。'
            : recovering && plan.next !== 'same-request' ? `${plan.message} 原请求的结果仍待确认。` : plan.message);
        }
        return;
      }

      let nextReceipt: TurnReceipt;
      try {
        nextReceipt = TurnReceiptSchema.parse(result.receipt);
        if (nextReceipt.saveId !== saveId || nextReceipt.idempotencyKey !== request.idempotencyKey) throw new Error('INVALID_GAME_RESPONSE');
      } catch (error) {
        const plan = cloudGameErrorPlan(error);
        setPendingTurn(request);
        setFailure({ next: 'same-request', diagnostic: cloudGameDiagnostic(error) });
        setNotice(plan.message);
        return;
      }
      setReceipt(nextReceipt);
      const resultNarrative = result.narrative && typeof result.narrative === 'object'
        ? result.narrative as Record<string, unknown> : undefined;
      const decision = nextReceipt.decision;
      setNarrative(typeof resultNarrative?.text === 'string' ? resultNarrative.text
        : decision.status === 'clarify' ? decision.question
          : decision.status === 'rejected' ? decision.message
            : recovering ? '行动已确认。' : '行动已执行。');
      setPendingTurn(null);
      if (decision.status === 'accepted' || decision.status === 'clarify') setText('');
      try {
        const outcome = await refresh();
        const baseNotice = recovering
          ? decision.status === 'accepted' ? '行动已确认，当前存档已同步。'
            : decision.status === 'clarify' ? '还需要补充说明；存档状态没有变化。'
              : '这次行动没有执行；存档状态没有变化。你可以修改后再试。'
          : decision.status === 'accepted' ? '行动已结算，当前存档已更新。'
            : decision.status === 'clarify' ? '还需要补充说明后才能继续；存档状态没有变化。'
              : '这次行动没有执行，存档状态没有变化。你可以修改后再试。';
        setNotice(outcome.rulesUnavailable
          ? `${cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message} 已保留刚收到的回执。`
          : outcome.suggestionsUnavailable ? `${baseNotice} 行动建议暂不可用，你仍可直接输入。` : baseNotice);
      } catch (error) {
        setFailure({ next: saveCannotBeRead(error) ? cloudGameErrorPlan(error).next : 'reload', diagnostic: cloudGameDiagnostic(error) });
        setNotice(saveCannotBeRead(error)
          ? '行动回执已收到，但当前账号暂不能读取这份存档。请确认账号后再继续。'
          : '行动回执已收到，但最新存档暂未刷新。请重新读取状态后继续；本次回执仍显示在页面上。');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const utterance = text.trim();
    if (!save || !utterance || busy || refreshBusy || saveNeedsRefresh || pendingTurn || rulesUnavailable) return;
    const clarificationOf = receipt?.decision.status === 'clarify' && receipt.decision.revision === save.revision
      ? receipt.idempotencyKey : undefined;
    const request: PendingTurn = {
      text: utterance,
      expectedRevision: save.revision,
      idempotencyKey: createIdempotencyKey(),
      ...(clarificationOf ? { clarificationOf } : {}),
    };
    await sendTurn(request, true, false);
  }

  async function reconcilePendingTurn() {
    if (!pendingTurn || busy) return;
    // requestNarrative is presentation-only; keep the same action fingerprint/key
    // and omit another model call while resolving an ambiguous transport result.
    await sendTurn(pendingTurn, false, true);
  }

  const eventRows = projectReceiptEvents(receipt);
  return <GameShell saveId={saveId} readingReady={!!save}>
    <header className="game-topline"><div><span className="eyebrow">云端存档</span><h2>行旅</h2></div><button className="secondary" onClick={onBack}>返回山门</button></header>
    <div className="game-workspace cloud-game" data-testid="p2-cloud-game">
      <aside className="game-rail" aria-label="游戏资料"><button aria-expanded={showState} disabled={!save} onClick={() => setShowState(true)}>存档状态</button><button onClick={onWorld}>世界设定</button></aside>
      <div className="story-column">
      <div className="story-reading" role="region" tabIndex={0} aria-label="剧情记录">
    <p className="game-statusline" role="status" data-testid="p2-status">{notice}</p>
    {!save && !notFound && <div className="card"><p>存档尚未载入。请检查连接，或恢复创建时使用的账号。</p><div className="actions"><button className="secondary" onClick={() => void reloadSave()} disabled={refreshBusy}>{refreshBusy ? '正在读取…' : '重新读取存档'}</button><button className="primary" onClick={onLogin}>账号与云档</button></div></div>}
    {notFound && <div className="card"><h2>找不到这份存档</h2><p>账号下没有这份服务端存档，或链接来自另一个账号。</p><button className="primary" onClick={onHome}>回到首页</button></div>}
    {save && <>
      <section className="cloud-game-state" aria-label="服务端存档状态">
        <p>存档版本 <strong data-testid="p2-revision">{save.revision}</strong></p>
        <p>行旅时间 <strong data-testid="p2-game-minute">{typeof save.state.facts.gameMinute === 'number' ? save.state.facts.gameMinute : '未记录'}</strong>{typeof save.state.facts.gameMinute === 'number' ? ' 分钟' : ''}</p>
        {save.schemaVersion === 3 && <p>记忆 <strong>{save.memoryMode === 'forgetting' ? '真实遗忘' : '存档与继续'}</strong></p>}
      </section>
      {!!narrative && <section className="cloud-game-narrative" aria-label="行动叙述"><h3>纪事</h3><p data-testid="p2-narrative">{narrative}</p></section>}
      {!!receipt && <section className="cloud-game-receipt" data-testid="p2-receipt" aria-label="本次结果">
        <h3>本次结果</h3>
        <p>{receipt.decision.status === 'accepted' ? '行动已执行。' : receipt.decision.status === 'clarify' ? '还需要补充说明。' : '行动未执行。'}</p>
        {eventRows.length ? <ul>{eventRows.map(event => <li key={event.eventId}>
          {event.delta ? `存档变化：${formatReceiptDelta(event.delta)}` : '存档状态已记录。'}
        </li>)}</ul> : <p>存档状态没有变化。</p>}
        <details><summary>查看记录编号</summary><p>请求 <code>{receipt.idempotencyKey}</code> · 存档修订 {receipt.resultingRevision}</p></details>
      </section>}
    </>}
      </div>
      {!!suggestions.length && <details className="cloud-game-suggestions"><summary>当前可尝试的行动</summary><div className="actions">{suggestions.map(item => <button className="secondary" key={item.id} disabled={busy || refreshBusy || saveNeedsRefresh || pendingTurn !== null || rulesUnavailable} onClick={() => setText(item.text)}>{item.label}</button>)}</div></details>}
      {failure && !pendingTurn && !rulesUnavailable && <section className="cloud-game-recovery" aria-label="请求恢复">
        {save && failure.next === 'reload' && <button type="button" className="secondary" onClick={() => void reloadSave()} disabled={refreshBusy || busy}>{refreshBusy ? '正在读取…' : '重新读取存档'}</button>}
        {save && failure.next === 'account' && <button type="button" className="secondary" onClick={onLogin}>账号与云档</button>}
        {save && failure.next === 'home' && <button type="button" className="secondary" onClick={onBack}>查看存档列表</button>}
        <details><summary>查看错误详情</summary><p><code>{failure.diagnostic}</code></p></details>
      </section>}
      {pendingTurn && <section className="cloud-game-recovery" role="alert" aria-live="assertive">
        <p>暂时无法确认这次行动是否生效。内容已保留；先核对本次结果，再决定下一步。</p>
        <button type="button" className="secondary" onClick={() => void reconcilePendingTurn()} disabled={busy || refreshBusy || !save}>{busy ? '正在核对…' : '核对本次提交'}</button>
        {failure?.next === 'account' && <button type="button" className="secondary" onClick={onLogin}>账号与云档</button>}
        {failure?.next === 'home' && <button type="button" className="secondary" onClick={onBack}>查看存档列表</button>}
        {failure?.next === 'reload' && !rulesUnavailable && <button type="button" className="secondary" onClick={() => void reloadSave()} disabled={refreshBusy || busy}>重新读取存档</button>}
        {failure && <details><summary>查看错误详情</summary><p><code>{failure.diagnostic}</code></p></details>}
      </section>}
      {rulesUnavailable && save && <div className="cloud-game-recovery" role="status"><p>服务器规则尚未就绪，行动输入已停用。</p><button type="button" className="secondary" onClick={() => void reloadSave()} disabled={refreshBusy || busy}>{refreshBusy ? '正在读取…' : '重新读取存档'}</button>{failure && <details><summary>查看错误详情</summary><p><code>{failure.diagnostic}</code></p></details>}</div>}
      {save && <form className="intent-composer cloud-game-action" aria-busy={busy || refreshBusy} onSubmit={submit}>
        <label htmlFor="p2-action-input">你要做什么？</label>
        <textarea id="p2-action-input" data-testid="p2-action-input" value={text} maxLength={8_000} onChange={event => setText(event.target.value)} disabled={busy || refreshBusy || saveNeedsRefresh || pendingTurn !== null || rulesUnavailable} />
        <button type="submit" className="primary" data-testid="p2-submit-action" disabled={busy || refreshBusy || saveNeedsRefresh || pendingTurn !== null || rulesUnavailable || !text.trim()}>{busy ? '正在提交…' : '提交行动'}</button>
      </form>}
      </div>
    </div>
    {showState && save && <GameInfoDialog label="存档状态" onClose={() => setShowState(false)}>
      <p>当前修订：{save.revision}</p><p>规则版本：<code>{save.ruleVersion}</code></p><p>世界设定版本：<code>{save.canonVersion}</code></p>
      <p>资料仅来自这份服务端存档；本页未提供人物记忆检索。</p>
    </GameInfoDialog>}
  </GameShell>;
}
