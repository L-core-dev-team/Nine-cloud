import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  type ActionIntentInput,
  type Decision,
  type SaveEnvelopeV3,
  type TurnReceipt,
} from '@jiuxiao/contracts';
import {
  commitLocalAuthoritativeTurn,
  exportLocalAuthorityArchive,
  readLocalAuthoritativeSave,
  verifyLocalEventChain,
  verifyLocalReplay,
} from '../authoritative-turn-store';
import { createIdempotencyKey, type LocalSave } from '../storage';
import { formatReceiptDelta, projectReceiptEvents } from '../receipt-event-view';
import { loadP2ReviewGameplayRuntime, type P2ReviewGameplayRuntime } from '../p2-review-gameplay-runtime';

type AuthoritySnapshot = {
  save: SaveEnvelopeV3;
  runtime: P2ReviewGameplayRuntime;
  latestAcceptedReceipt: TurnReceipt | null;
  eventCount: number;
  chainValid: boolean;
  replayValid: boolean;
};

function P2ReviewGame({ save, onBack }: { save: LocalSave | undefined; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<AuthoritySnapshot | null>(null);
  const [currentReceipt, setCurrentReceipt] = useState<TurnReceipt | null>(null);
  const [presentationText, setPresentationText] = useState('');
  const [actionText, setActionText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('正在读取本机权威存档……');

  const refresh = useCallback(async (runtimeOverride?: P2ReviewGameplayRuntime) => {
    if (!save?.p2ReviewCandidate) {
      setNotice('此页面只接受本机开发环境创建的 P2 审阅候选存档。');
      return;
    }
    const runtime = runtimeOverride ?? await loadP2ReviewGameplayRuntime();
    const authoritativeSave = await readLocalAuthoritativeSave(save.saveId);
    if (!authoritativeSave) {
      setSnapshot(null);
      setNotice('没有找到对应的本机权威存档。旧版兼容存档不会被提升为规则存档。');
      return;
    }
    if (authoritativeSave.ruleVersion !== runtime.ruleVersion
      || authoritativeSave.canonVersion !== runtime.canonVersion) {
      setSnapshot(null);
      setNotice('候选规则或设定版本与建档时不一致，已停止加载。');
      return;
    }
    const [chain, replay, archive] = await Promise.all([
      verifyLocalEventChain(save.saveId),
      verifyLocalReplay(save.saveId, runtime.reduce),
      exportLocalAuthorityArchive(save.saveId, runtime.reduce),
    ]);
    if (!archive) {
      setSnapshot(null);
      setNotice('权威存档历史不可用。');
      return;
    }
    const latestAcceptedReceipt = archive.receipts.map(row => row.receipt)
      .filter(receipt => receipt.decision.status === 'accepted'
        && receipt.resultingRevision === authoritativeSave.revision)
      .at(-1) ?? null;
    setSnapshot({
      save: authoritativeSave,
      runtime,
      latestAcceptedReceipt,
      eventCount: chain.eventCount,
      chainValid: chain.valid,
      replayValid: replay.valid,
    });
    setNotice(chain.valid && replay.valid ? '存档、事件链与规则回放均已核对。' : '完整性检查未通过，已停止提交新行动。');
  }, [save]);

  useEffect(() => {
    let active = true;
    void loadP2ReviewGameplayRuntime().then(async runtime => {
      if (active) await refresh(runtime);
    }).catch(() => {
      if (active) setNotice('候选规则、设定字节或浏览器密码学 API 不可用。');
    });
    return () => { active = false; };
  }, [refresh]);

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || busy || !snapshot.chainValid || !snapshot.replayValid) return;
    const text = actionText.trim();
    if (!text) return;
    setBusy(true);
    setNotice('规则正在结算；世界事实将在回执写入后显示。');
    try {
      const idempotencyKey = createIdempotencyKey();
      const parsed = snapshot.runtime.parse({ text, save: snapshot.save, idempotencyKey });
      const common = {
        saveId: snapshot.save.saveId,
        actorId: snapshot.save.state.playerId,
        branchId: 'root' as const,
        expectedRevision: snapshot.save.revision,
        idempotencyKey,
      };
      let intent: ActionIntentInput;
      let parserDecision: Decision | null = null;
      if (parsed.status === 'ready') {
        intent = parsed.intent;
      } else {
        // The request fingerprint covers the original text; the receipt stores only its digest
        // and the parser's generic clarification, never the raw utterance.
        intent = { ...common, kind: 'free_text', payload: { text } };
        parserDecision = parsed.decision;
      }

      const result = await commitLocalAuthoritativeTurn({
        intent,
        decide: (action, currentSave, context) => parserDecision
          ?? snapshot.runtime.decide(action, currentSave, context),
        reduce: snapshot.runtime.reduce,
      });
      if (result.status === 'committed') {
        setCurrentReceipt(result.receipt);
        setPresentationText(snapshot.runtime.narrate(result.receipt));
        setActionText('');
        await refresh(snapshot.runtime);
        setNotice(`已提交至修订 ${result.save.revision}。${(await verifyLocalEventChain(save!.saveId)).valid ? '事件链完整性通过。' : '事件链完整性检查失败。'}`);
      } else if (result.status === 'recorded' || result.status === 'duplicate') {
        setCurrentReceipt(result.receipt);
        setPresentationText(parsed.status === 'clarify'
          ? parsed.presentationQuestion
          : result.receipt.decision.status === 'rejected' ? result.receipt.decision.message
            : snapshot.runtime.narrate(result.receipt));
        await refresh(snapshot.runtime);
        setNotice(result.receipt.decision.status === 'rejected'
          ? `行动被规则拒绝；修订号仍为 ${result.receipt.resultingRevision}，未写入事件。`
          : `澄清回执已保存；修订号仍为 ${result.receipt.resultingRevision}，未写入事件。`);
      } else if (result.status === 'revision_conflict') {
        await refresh(snapshot.runtime);
        setNotice(`存档修订已变化（预期 ${result.expectedRevision}，当前 ${result.actualRevision}）。刷新后再提交。`);
      } else {
        setNotice(`本次提交未完成：${result.status}。没有把未确认结果显示为已提交。`);
      }
    } catch {
      setNotice('结算或回执校验失败。世界状态未显示为已提交，请检查存档完整性后重试。');
    } finally {
      setBusy(false);
    }
  }

  const visibleTargets = snapshot ? snapshot.runtime.visibleTargets(snapshot.save) : null;
  const receipt = currentReceipt ?? snapshot?.latestAcceptedReceipt ?? null;
  const narrative = presentationText || (receipt && snapshot ? snapshot.runtime.narrate(receipt) : '');
  const receiptEvents = projectReceiptEvents(receipt);
  const receiptRuleVersion = receipt && 'rulesVersion' in receipt && typeof receipt.rulesVersion === 'string'
    ? receipt.rulesVersion : 'legacy receipt';

  return <section className="page p2-review-game" data-testid="p2-review-gameplay">
    <span className="eyebrow">九霄 · 本机玩法审阅</span>
    <h2>世界已记下你做的事。</h2>
    <p className="quiet-note">开发环境专用候选路径。规则与序章仍为候选内容；不启用生产回合 API，也不代表 P1 或 Canon 验收完成。</p>
    {snapshot && <>
      <section className="card" aria-label="世界简报">
        <h3>世界简报</h3>
        {snapshot.runtime.opening.map((paragraph, index) => <p key={`opening-${index}`}>{paragraph}</p>)}
        {snapshot.latestAcceptedReceipt && <p>上一轮记录：{snapshot.runtime.narrate(snapshot.latestAcceptedReceipt)}</p>}
      </section>
      <section className="stats" aria-label="世界状态">
        <div><small>修订</small><strong data-testid="p2-revision">{snapshot.save.revision}</strong></div>
        <div><small>游戏时间</small><strong data-testid="p2-game-minute">{String(snapshot.save.state.facts.gameMinute ?? 0)}</strong></div>
        <div><small>事件数</small><strong data-testid="p2-event-count">{snapshot.eventCount}</strong></div>
        <div><small>NPC 记忆线</small><strong>{snapshot.save.memoryMode === 'forgetting' ? '真实遗忘' : '存档与继续'}</strong></div>
      </section>
      {visibleTargets && visibleTargets.observationTargets.length > 0 && <div className="actions" aria-label="当前可见观察目标">
        {visibleTargets.observationTargets.map(target => <button key={target.id} type="button" className="secondary"
          onClick={() => setActionText(`观察${target.label}`)}>观察{target.label}</button>)}
      </div>}
      {visibleTargets && visibleTargets.knownLocations.length > 0 && <div className="actions" aria-label="已知地点">
        {visibleTargets.knownLocations.map(target => <button key={target.id} type="button" className="secondary"
          onClick={() => setActionText(`去${target.label}`)}>去{target.label}</button>)}
      </div>}
      <form onSubmit={submitAction} aria-label="提交行动">
        <label htmlFor="p2-action">写下你要做的事</label>
        <textarea id="p2-action" data-testid="p2-action-input" value={actionText}
          onChange={event => setActionText(event.target.value)} maxLength={4000} />
        <button type="submit" className="primary" disabled={busy || !snapshot.chainValid || !snapshot.replayValid}>
          {busy ? '结算中……' : '提交行动'}
        </button>
      </form>
      {narrative && <section className="card" aria-label="行动叙事" data-testid="p2-narrative">
        <h3>已经发生</h3>
        {narrative.split('\n').map((paragraph, index) => <p key={`narrative-${index}`}>{paragraph}</p>)}
      </section>}
      {receipt && <section className="card" aria-label="状态回执" data-testid="p2-receipt">
        <h3>状态回执</h3>
        <p>结果：{receipt.decision.status}；修订：{receipt.resultingRevision}；规则：{receiptRuleVersion}</p>
        {receipt.decision.status === 'rejected' && <p>拒绝码：{receipt.decision.code}。{receipt.decision.message}</p>}
        {receipt.decision.status === 'clarify' && <p>需要补充：{receipt.decision.question}</p>}
        <ul>{receiptEvents.map(item => <li key={item.eventId} data-event-id={item.eventId}>
          {item.eventType} · 修订 {item.stateRevision} · <span data-testid="p2-receipt-delta">{formatReceiptDelta(item.delta) ?? '状态增量缺失'}</span>
        </li>)}</ul>
      </section>}
      <p role="status" data-testid="p2-status">{notice}</p>
      <p aria-label="完整性验证">事件链：{snapshot.chainValid ? '通过' : '失败'}；规则回放：{snapshot.replayValid ? '通过' : '失败'}</p>
    </>}
    {!snapshot && <p role="status">{notice}</p>}
    <button type="button" className="secondary" onClick={onBack}>返回山门</button>
  </section>;
}

export default P2ReviewGame;
