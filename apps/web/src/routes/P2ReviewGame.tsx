import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  type ActionIntentInput,
  type Decision,
  type SaveEnvelopeV3,
  type TurnReceipt,
} from '@jiuxiao/contracts';
import {
  recognizeAuthorizedMemoryCue,
  recallAuthorizedObservations,
  type AuthorizedRecallResult,
} from '@jiuxiao/domain';
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
import { syncP2CandidateMemoryProjection, type CandidateMemoryProjectionSnapshot } from '../p2-candidate-memory-store';
import {
  latestP2CandidateDigestReview,
  readP2CandidateDigestReviewState,
  recordP2CandidateDigestReview,
  type P2CandidateDigestReviewRecord,
} from '../p2-candidate-digest-review';
import type { P2CandidateApprovedPlotDigest } from '../p2-candidate-narrative';
import {
  buildP2CandidateDigestSourcesFromReceipts,
  createP2CandidateExtractiveDigestAdapter,
  enqueueP2CandidateDigestRebuild,
  runP2CandidateDigestQueue,
  type P2CandidateDigestJob,
  type P2CandidateDigestSource,
  type P2CandidateDigestSourceRef,
} from '../p2-candidate-digest-queue';

type AuthoritySnapshot = {
  save: SaveEnvelopeV3;
  runtime: P2ReviewGameplayRuntime;
  latestReceipt: TurnReceipt | null;
  latestAcceptedReceipt: TurnReceipt | null;
  pendingClarificationId?: string;
  eventCount: number;
  chainValid: boolean;
  replayValid: boolean;
  previousStopId?: string;
  memoryProjection: CandidateMemoryProjectionSnapshot | null;
  memoryError: string | null;
};

function P2ReviewGame({ save, onBack }: { save: LocalSave | undefined; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<AuthoritySnapshot | null>(null);
  const [currentReceipt, setCurrentReceipt] = useState<TurnReceipt | null>(null);
  const [presentationText, setPresentationText] = useState('');
  const [actionText, setActionText] = useState('');
  const [memoryNpcId, setMemoryNpcId] = useState('');
  const [memoryRecall, setMemoryRecall] = useState<AuthorizedRecallResult | null>(null);
  const [digestJobs, setDigestJobs] = useState<readonly P2CandidateDigestJob[]>([]);
  const [digestReviews, setDigestReviews] = useState<readonly P2CandidateDigestReviewRecord[]>([]);
  const [approvedPlotDigests, setApprovedPlotDigests] = useState<readonly P2CandidateApprovedPlotDigest[]>([]);
  const [staleApprovedDigestIds, setStaleApprovedDigestIds] = useState<readonly string[]>([]);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestNotice, setDigestNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('正在读取本机权威存档……');

  const refresh = useCallback(async (runtimeOverride?: P2ReviewGameplayRuntime): Promise<AuthoritySnapshot | null> => {
    if (!save?.p2ReviewCandidate) {
      setNotice('此页面只接受本机开发环境创建的 P2 审阅候选存档。');
      return null;
    }
    const runtime = runtimeOverride ?? await loadP2ReviewGameplayRuntime();
    const authoritativeSave = await readLocalAuthoritativeSave(save.saveId);
    if (!authoritativeSave) {
      setSnapshot(null);
      setNotice('没有找到对应的本机权威存档。旧版兼容存档不会被提升为规则存档。');
      return null;
    }
    if (authoritativeSave.ruleVersion !== runtime.ruleVersion || authoritativeSave.canonVersion !== runtime.canonVersion) {
      setSnapshot(null);
      setNotice('候选规则或设定版本与建档时不一致，已停止加载。');
      return null;
    }
    const [chain, replay, archive] = await Promise.all([
      verifyLocalEventChain(save.saveId),
      verifyLocalReplay(save.saveId, runtime.reduce),
      exportLocalAuthorityArchive(save.saveId, runtime.reduce),
    ]);
    if (!archive) {
      setSnapshot(null);
      setNotice('权威存档历史不可用。');
      return null;
    }
    const latestAcceptedReceipt = archive.receipts.map(row => row.receipt)
      .filter(receipt => receipt.decision.status === 'accepted' && receipt.resultingRevision <= authoritativeSave.revision)
      .sort((left, right) => right.resultingRevision - left.resultingRevision)[0] ?? null;
    const latestReceipt = archive.receipts.map(row => row.receipt)
      .filter(receipt => receipt.resultingRevision <= authoritativeSave.revision)
      .sort((left, right) => right.resultingRevision - left.resultingRevision
        || right.idempotencyKey.localeCompare(left.idempotencyKey))[0] ?? null;
    const resolvedClarifications = new Set(archive.receipts.map(row => row.receipt.clarificationOf)
      .filter((value): value is string => typeof value === 'string'));
    const unresolvedClarifications = archive.receipts.map(row => row.receipt).filter(receipt =>
      receipt.resultingRevision === authoritativeSave.revision && receipt.decision.status === 'clarify'
      && 'interactionId' in receipt.decision && !resolvedClarifications.has(receipt.decision.interactionId));
    const pendingClarificationId = unresolvedClarifications.length === 1 &&
      'interactionId' in unresolvedClarifications[0]!.decision
      ? unresolvedClarifications[0]!.decision.interactionId : undefined;
    const previousStopId = previousStopFromArchive(archive.events);
    let memoryProjection: CandidateMemoryProjectionSnapshot | null = null;
    let memoryError: string | null = null;
    if (chain.valid && replay.valid) {
      try { memoryProjection = await syncP2CandidateMemoryProjection(authoritativeSave, archive.observations); }
      catch (error) { memoryError = error instanceof Error ? error.message : 'MEMORY_PROJECTION_UNAVAILABLE'; }
    }
    const next: AuthoritySnapshot = {
      save: authoritativeSave,
      runtime,
      latestReceipt,
      latestAcceptedReceipt,
      ...(pendingClarificationId ? { pendingClarificationId } : {}),
      eventCount: chain.eventCount,
      chainValid: chain.valid,
      replayValid: replay.valid,
      ...(previousStopId ? { previousStopId } : {}),
      memoryProjection,
      memoryError,
    };
    setSnapshot(next);
    const integrityNotice = chain.valid && replay.valid
      ? memoryError ? '世界存档、事件链与规则回放已核对；NPC 记忆投影不可用，记忆问答将拒绝读取。'
        : '世界存档、事件链、规则回放与所选记忆投影均已核对。'
      : '完整性检查未通过，已停止提交新行动。';
    setNotice(integrityNotice);
    return next;
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

  useEffect(() => {
    if (!snapshot) return;
    let active = true;
    void readP2CandidateDigestReviewState({ save: snapshot.save,
      resolveSources: refs => resolveP6DigestSources(snapshot.save, snapshot.runtime, refs) }).then(state => {
      if (!active) return;
      setDigestJobs(state.jobs);
      setDigestReviews(state.reviews);
      setApprovedPlotDigests(state.approvedPlotDigests);
      setStaleApprovedDigestIds(state.staleApprovedDigestIds);
    }).catch(() => {
      if (active) setDigestNotice('本机摘要队列不可用；行动、状态和双记忆检索不受影响。');
    });
    return () => { active = false; };
  }, [snapshot?.save.saveId, snapshot?.save.memoryMode, snapshot?.save.revision]);

  async function rebuildDigestDraft() {
    if (!snapshot || digestBusy || !snapshot.chainValid || !snapshot.replayValid) return;
    setDigestBusy(true);
    setDigestNotice('正在从已提交、玩家可见的规则回执生成零模型摘要草稿……');
    try {
      const archive = await exportLocalAuthorityArchive(snapshot.save.saveId, snapshot.runtime.reduce);
      if (!archive) throw new Error('P6_DIGEST_AUTHORITY_ARCHIVE_UNAVAILABLE');
      const receipts = archive.receipts.map(row => row.receipt);
      const sources = buildP2CandidateDigestSourcesFromReceipts({
        save: snapshot.save,
        receipts,
        narrate: snapshot.runtime.narrate,
      });
      if (!sources.length) {
        setDigestNotice('还没有可汇总的已接受回执。澄清、拒绝和未提交文本不会进入摘要。');
        return;
      }
      const fromRevision = sources[0]!.revision;
      const throughRevision = sources[sources.length - 1]!.revision;
      await enqueueP2CandidateDigestRebuild({
        save: snapshot.save,
        sources,
        fromRevision,
        throughRevision,
        generatorVersion: 'extractive-receipt-v1',
        promptVersion: 'none',
      });
      const adapter = createP2CandidateExtractiveDigestAdapter();
      const run = await runP2CandidateDigestQueue({
        save: snapshot.save,
        adapter,
        maxCostMicros: 0,
        maxJobs: 3,
        maxConcurrency: 1,
        resolveSources: refs => resolveP6DigestSources(snapshot.save, snapshot.runtime, refs),
      });
      const updatedState = await readP2CandidateDigestReviewState({ save: snapshot.save,
        resolveSources: refs => resolveP6DigestSources(snapshot.save, snapshot.runtime, refs) });
      setDigestJobs(updatedState.jobs);
      setDigestReviews(updatedState.reviews);
      setApprovedPlotDigests(updatedState.approvedPlotDigests);
      setStaleApprovedDigestIds(updatedState.staleApprovedDigestIds);
      setDigestNotice(run.status === 'budget-limited'
        ? '摘要任务暂停：本次成本额度不足，没有调用生成服务。'
        : `摘要队列已处理：完成 ${run.completed} 项，失败 ${run.failed} 项，来源过期 ${run.stale} 项；本机摘句成本为 0。`);
    } catch (error) {
      setDigestNotice(error instanceof Error ? `摘要草稿未生成：${error.message}` : '摘要草稿未生成；原回执与记忆未改变。');
    } finally { setDigestBusy(false); }
  }

  async function decideDigest(job: P2CandidateDigestJob, decision: 'approved' | 'rejected') {
    if (!snapshot || digestBusy || !job.artifact || !job.artifactHash || !snapshot.chainValid || !snapshot.replayValid) return;
    setDigestBusy(true);
    setDigestNotice('正在重读来源回执、验证摘要哈希并保存本机审核记录……');
    try {
      const current = await refresh(snapshot.runtime);
      if (!current || !current.chainValid || !current.replayValid) throw new Error('P6_DIGEST_REVIEW_AUTHORITY_UNAVAILABLE');
      const result = await recordP2CandidateDigestReview({
        save: current.save, jobId: job.jobId, expectedArtifactHash: job.artifactHash, decision, reviewedAt: Date.now(),
        resolveSources: refs => resolveP6DigestSources(current.save, current.runtime, refs),
      });
      const state = await readP2CandidateDigestReviewState({ save: current.save,
        resolveSources: refs => resolveP6DigestSources(current.save, current.runtime, refs) });
      setDigestJobs(state.jobs);
      setDigestReviews(state.reviews);
      setApprovedPlotDigests(state.approvedPlotDigests);
      setStaleApprovedDigestIds(state.staleApprovedDigestIds);
      setDigestNotice(result.status === 'duplicate'
        ? '相同审核决定已存在；未重复写入。'
        : decision === 'approved'
          ? '已记入本机候选审核记录；摘要仅进入本机候选叙事上下文，不写入 NPC 记忆、Canon 或权威存档。'
          : '已记入本机拒绝记录；摘要不会进入候选叙事上下文。');
    } catch (error) {
      setDigestNotice(error instanceof Error ? `审核未保存：${error.message}` : '审核未保存；摘要和世界存档均未改变。');
    } finally { setDigestBusy(false); }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || busy || !snapshot.chainValid || !snapshot.replayValid) return;
    const text = actionText.trim();
    if (!text) return;
    setBusy(true);
    try {
      const current = await refresh(snapshot.runtime);
      if (!current || !current.chainValid || !current.replayValid) return;
      const cue = recognizeAuthorizedMemoryCue(text);
      if (cue) {
        if (current.memoryError || !current.memoryProjection) {
          setMemoryRecall(null);
          setNotice('记忆索引不可验证；本次问答没有读取任何旧记忆，也没有推进世界。');
          return;
        }
        const options = current.runtime.memoryNpcChoices(current.save,
          current.memoryProjection.observations.map(observation => observation.npcId));
        const targetNpcId = options.some(option => option.id === memoryNpcId) ? memoryNpcId : options[0]?.id;
        if (!targetNpcId) {
          setMemoryRecall(null);
          setNotice('当前没有可询问的 NPC。记忆查询没有推进世界。');
          return;
        }
        setMemoryNpcId(targetNpcId);
        setMemoryRecall(recallAuthorizedObservations(
          current.memoryProjection.observations.filter(observation => observation.npcId === targetNpcId),
          { query: cue.query, slot: cue.slot, gameMinute: Number(current.save.state.facts.gameMinute ?? 0),
            throughRevision: current.save.revision, forgetting: current.save.memoryMode === 'forgetting' },
        ));
        setActionText('');
        setNotice('记忆查询已完成；它是只读操作，没有新增回合、事件或游戏时间。');
        return;
      }
      const idempotencyKey = createIdempotencyKey();
      const parsed = current.runtime.parse({ text, save: current.save, idempotencyKey,
        ...(current.pendingClarificationId ? { clarificationOf: current.pendingClarificationId } : {}) });
      const common = { ...intentIdentity(current.save, idempotencyKey),
        ...(current.pendingClarificationId ? { clarificationOf: current.pendingClarificationId } : {}) };
      const intent: ActionIntentInput = parsed.status === 'ready'
        ? parsed.intent
        : { ...common, kind: 'free_text', payload: { text } };
      await commitIntent(current, intent, parsed.status === 'clarify' ? parsed.decision : null,
        parsed.status === 'clarify' ? parsed.presentationQuestion : undefined);
    } catch {
      setNotice('行动未完成。没有把未确认结果显示为已提交；请检查存档完整性后重试。');
    } finally { setBusy(false); }
  }

  async function commitIntent(current: AuthoritySnapshot, intent: ActionIntentInput, parserDecision: Decision | null,
    parserPresentation?: string) {
    setNotice('规则正在结算；只有通过事务回执后才显示世界事实。');
    const result = await commitLocalAuthoritativeTurn({
      intent,
      decide: (action, currentSave, context) => parserDecision
        ?? current.runtime.decide(action, currentSave, context),
      reduce: current.runtime.reduce,
      authorizeEvents: current.runtime.authorizeEvents,
    });
    if (result.status === 'committed') {
      setPresentationText(current.runtime.narrate(result.receipt));
      setMemoryRecall(null);
      setActionText('');
      const updated = await refresh(current.runtime);
      setCurrentReceipt(result.receipt);
      const chain = await verifyLocalEventChain(current.save.saveId);
      setNotice(updated?.chainValid && updated.replayValid && chain.valid
        ? `行动已提交至修订 ${result.save.revision}。记忆观察已写入权威授权账本，并投影至「${memoryModeLabel(result.save.memoryMode)}」。`
        : `修订 ${result.save.revision} 已提交；完整性或记忆投影需要重新核对。`);
    } else if (result.status === 'recorded' || result.status === 'duplicate') {
      setCurrentReceipt(result.receipt);
      setPresentationText(result.receipt.decision.status === 'clarify' ? result.receipt.decision.question
        : result.receipt.decision.status === 'rejected' ? result.receipt.decision.message
          : current.runtime.narrate(result.receipt));
      if (result.receipt.decision.status === 'clarify' && parserPresentation) setPresentationText(parserPresentation);
      setMemoryRecall(null);
      await refresh(current.runtime);
      setNotice(result.receipt.decision.status === 'rejected'
        ? `行动被规则拒绝；修订号仍为 ${result.receipt.resultingRevision}，未写入世界事件。`
        : `澄清回执已保存；修订号仍为 ${result.receipt.resultingRevision}，未写入世界事件。`);
    } else if (result.status === 'revision_conflict') {
      await refresh(current.runtime);
      setNotice(`存档修订已变化（预期 ${result.expectedRevision}，当前 ${result.actualRevision}）。已刷新，请重新选择行动。`);
    } else {
      setNotice(`本次提交未完成：${result.status}。没有把未确认结果显示为已提交。`);
    }
  }

  const suggestions = snapshot ? snapshot.runtime.actionSuggestions(snapshot.save) : null;
  const structuredActions = snapshot ? snapshot.runtime.structuredActions(snapshot.save) : [];
  const scene = snapshot ? snapshot.runtime.sceneStatus(snapshot.save, snapshot.previousStopId) : null;
  const memoryNpcChoices = snapshot ? snapshot.runtime.memoryNpcChoices(snapshot.save,
    snapshot.memoryProjection?.observations.map(observation => observation.npcId) ?? []) : [];
  const receipt = currentReceipt ?? snapshot?.latestReceipt ?? null;
  const narrativeContext = snapshot ? snapshot.runtime.narrativeContext(snapshot.save, receipt, memoryRecall,
    snapshot.memoryProjection?.observations.map(observation => observation.eventId) ?? [], approvedPlotDigests) : null;
  const narrative = presentationText || (receipt && snapshot ? snapshot.runtime.narrate(receipt) : '');
  const receiptEvents = projectReceiptEvents(receipt);
  const receiptRuleVersion = receipt && 'rulesVersion' in receipt && typeof receipt.rulesVersion === 'string'
    ? receipt.rulesVersion : 'candidate receipt';
  const actionDisabled = busy || !snapshot?.chainValid || !snapshot.replayValid;

  return <section className="page p2-review-game" data-testid="p2-review-gameplay">
    <span className="eyebrow">{import.meta.env.JIUXIAO_PREVIEW_1 ? '九霄 · 1.0 预览版' : '九霄 · 本机玩法审阅'}</span>
    <h2>世界已记下你做的事。</h2>
    <p className="quiet-note">{import.meta.env.JIUXIAO_PREVIEW_1
      ? '这段行旅保存在当前设备。输入你想做的事，或选择下方行动建议；世界会记下已经发生的事。'
      : '仅限开发环境的候选玩法。使用本地规则、IndexedDB 与零模型叙事；不启用生产回合 API，不代表 P1、Canon 或发布验收完成。'}</p>
    {snapshot && <>
      <section className="card" aria-label="世界简报">
        <h3>世界简报</h3>
        {snapshot.runtime.opening.map((paragraph, index) => <p key={`opening-${index}`}>{paragraph}</p>)}
        {scene && <dl className="p2-scene-summary">
          <div><dt>当前地点</dt><dd data-testid="p2-current-location">{scene.currentLocation}</dd></div>
          <div><dt>上次停留点</dt><dd data-testid="p2-previous-stop">{scene.previousStop}</dd></div>
          <div><dt>可核对钩子</dt><dd>{scene.hook}</dd></div>
        </dl>}
        {scene && <details><summary>简报依据</summary><p>钩子依据：{scene.hookEvidence}</p><p>离线推进：{scene.offlineAdvance}</p></details>}
        {snapshot.latestAcceptedReceipt && <p>最近一次已接受行动：{snapshot.runtime.narrate(snapshot.latestAcceptedReceipt)}</p>}
      </section>
      <section className="stats" aria-label="世界状态">
        <div><small>修订</small><strong data-testid="p2-revision">{snapshot.save.revision}</strong></div>
        <div><small>游戏分钟</small><strong data-testid="p2-game-minute">{String(snapshot.save.state.facts.gameMinute ?? 0)}</strong></div>
        <div><small>已提交事件</small><strong data-testid="p2-event-count">{snapshot.eventCount}</strong></div>
        <div><small>NPC 记忆线</small><strong data-testid="p2-memory-mode">{memoryModeLabel(snapshot.save.memoryMode)}</strong></div>
      </section>
      {scene && <section className="card" aria-label="人物与任务状态" data-testid="p2-state-facts">
        <h3>人物与任务状态</h3>
        <p>体力 {scene.playerFacts.stamina} · 灵力 {scene.playerFacts.spiritStamina} · 首段任务：{scene.playerFacts.quest}</p>
        <p>已知线索：{scene.playerFacts.clues.join('、') || '暂无'}；物品：{scene.playerFacts.inventory.join('、') || '暂无'}</p>
      </section>}
      {suggestions && <section className="card" aria-label="可编辑行动建议">
        <h3>行动建议（点击填入，可继续编辑）</h3>
        <div className="actions" aria-label="移动行动建议">{suggestions.move.map((item, index) => <button key={`move-${item.text}`} data-testid={`p2-suggestion-move-${index}`} type="button" className="secondary" disabled={actionDisabled} onClick={() => setActionText(item.text)}>{item.label}</button>)}</div>
        <div className="actions" aria-label="观察行动建议">{suggestions.observe.map((item, index) => <button key={`observe-${item.text}`} data-testid={`p2-suggestion-observe-${index}`} type="button" className="secondary" disabled={actionDisabled} onClick={() => setActionText(item.text)}>{item.label}</button>)}</div>
        <div className="actions" aria-label="交谈行动建议">{suggestions.talk.map((item, index) => <button key={`talk-${item.text}`} data-testid={`p2-suggestion-talk-${index}`} type="button" className="secondary" disabled={actionDisabled} onClick={() => setActionText(item.text)}>{item.label}</button>)}</div>
        <div className="actions" aria-label="使用物品行动建议">{suggestions.useItem.map((item, index) => <button key={`use-${item.text}`} data-testid={`p2-suggestion-use-item-${index}`} type="button" className="secondary" disabled={actionDisabled} onClick={() => setActionText(item.text)}>{item.label}</button>)}</div>
        <div className="actions" aria-label="战斗行动建议">{suggestions.combat.map((item, index) => <button key={`combat-${item.text}`} data-testid={`p2-suggestion-combat-${index}`} type="button" className="secondary" disabled={actionDisabled} onClick={() => setActionText(item.text)}>{item.label}</button>)}</div>
        <p className="quiet-note">五类主要行动按钮只填入可编辑文本；手输和按钮共用同一可见目标解析器。拾取、子地点移动和任务领奖也填入文本后，再由同一权威规则事务结算。</p>
        <div className="actions" aria-label="当前可用的其他规则行动">{structuredActions.map((action, index) => <button key={`${action.kind}-${index}`} type="button" className="secondary" data-testid={`p2-structured-${action.kind}-${index}`} disabled={actionDisabled} onClick={() => setActionText(action.text)}>{action.label}</button>)}</div>
      </section>}
      <form onSubmit={submitAction} aria-label="提交行动">
        <label htmlFor="p2-action">行动或显式记忆问题</label>
        <textarea id="p2-action" data-testid="p2-action-input" value={actionText}
          onChange={event => { setActionText(event.target.value); setMemoryRecall(null); }} maxLength={4000}
          placeholder="例如：去望气台、观察落石堵渡、对岑九说：这石头怎么办；也可问：你还记得落石吗？" />
        <button type="submit" className="primary" data-testid="p2-submit-action" disabled={actionDisabled || !actionText.trim()}>
          {busy ? '结算中……' : '提交行动 / 查询记忆'}
        </button>
      </form>
      {memoryNpcChoices.length > 0 && <section className="card" aria-label="双记忆状态" data-testid="p2-memory-panel">
        <h3>NPC 记忆</h3>
        <p>所选模式：{memoryModeLabel(snapshot.save.memoryMode)}。来源是权威回合内冻结的授权观察；两个模式分别保存在独立 IndexedDB 数据库。</p>
        <label htmlFor="p2-memory-npc">询问哪位 NPC</label>
        <select id="p2-memory-npc" data-testid="p2-memory-npc" value={memoryNpcId || memoryNpcChoices[0]?.id || ''} onChange={event => setMemoryNpcId(event.target.value)}>
          {memoryNpcChoices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <p>授权观察 {snapshot.memoryProjection?.observations.filter(observation => observation.npcId === (memoryNpcId || memoryNpcChoices[0]?.id)).length ?? '不可用'} 条 · 投影游标 {snapshot.memoryProjection?.throughRevision ?? '不可用'} / 当前修订 {snapshot.save.revision}</p>
        {snapshot.memoryError && <p role="alert">记忆投影暂停：{snapshot.memoryError}</p>}
        {memoryRecall && <section aria-live="polite" data-testid="p2-memory-result">
          <h4>{memoryRecall.status === 'forgotten' ? '想不起来' : memoryRecall.status === 'abstain' ? '没有可核对的记忆' : memoryRecall.status === 'partial' ? '想起几个相似片段' : '找到一条可核对记忆'}</h4>
          {memoryRecall.status === 'complete' && <><p>{String(memoryRecall.authorizedFacts.summary ?? '记忆片段已核对。')}</p><p>证据类型：{memoryRecall.memoryClass} · 来源事件：<code>{memoryRecall.eventId}</code> · 匹配字段：{memoryRecall.matchingFields.join('、')}</p></>}
          {memoryRecall.status === 'partial' && <><ul>{memoryRecall.candidates.map(candidate => <li key={candidate.grantId}>{candidate.summary} · 来源事件 <code>{candidate.eventId}</code></li>)}</ul><p>结果标记为 partial；不会合并候选或替玩家确认是哪一件事。</p></>}
          {(memoryRecall.status === 'abstain' || memoryRecall.status === 'forgotten') && <p>{memoryRecall.message}</p>}
        </section>}
      </section>}
      {narrative && <section className="card" aria-label="行动叙事" data-testid="p2-narrative">
        <h3>最近一次结算</h3>
        {narrative.split('\n').map((paragraph, index) => <p key={`narrative-${index}`}>{paragraph}</p>)}
      </section>}
      {narrativeContext && <details className="card" aria-label="叙事来源上下文" data-testid="p2-narrative-context">
        <summary>查看叙事来源</summary>
        <p>结构化上下文只引用当前状态、已接受回执、NPC 授权记忆和已复核摘要。摘要需重新核对当前来源修订与内容哈希；摘要只对玩家可见，不能增加 NPC 知识。当前 Canon 运行包没有结构化人物档案字段，候选页不从散文推造人物资料；外部适配器和模型服务保持关闭。</p>
        <ul>{narrativeContext.sourceCatalog.map(source => <li key={`${source.kind}-${source.sourceId}`}>{source.kind} · {source.sourceId} · {source.visibility} · 修订 {source.revision}</li>)}</ul>
        {narrativeContext.approvedPlotDigests.map(digest => <article key={`digest-content-${digest.provenance.digestId}`} data-testid="p6-approved-digest-context">
          <strong>玩家可见剧情摘要 · 修订 {digest.provenance.fromRevision}–{digest.provenance.throughRevision}</strong>
          <p>{digest.summary}</p>
          <small>来源：{digest.sourceIds.join('、')} · 输出哈希：{digest.provenance.outputHash}</small>
        </article>)}
      </details>}
      <section className="card" aria-label="剧情摘要草稿" data-testid="p6-digest-panel">
        <h3>剧情回顾草稿</h3>
        <p>只汇集已接受回执中玩家可见的句子，不读取 NPC 私有记忆，不调用模型。摘要是可丢弃的派生产物；由你在本机明确复核后，才进入本机候选叙事上下文。审核记录不代表 P6 阶段签收。</p>
        <button type="button" className="secondary" data-testid="p6-build-digest"
          disabled={digestBusy || actionDisabled || snapshot.eventCount === 0} onClick={() => void rebuildDigestDraft()}>
          {digestBusy ? '摘要任务处理中……' : '生成 / 恢复摘要草稿'}
        </button>
        {digestNotice && <p role="status" data-testid="p6-digest-status">{digestNotice}</p>}
        {staleApprovedDigestIds.length > 0 && <p role="status">有已批准摘要的来源范围已变化，已从候选上下文移除：{staleApprovedDigestIds.join('、')}</p>}
        {digestJobs.filter(job => job.artifact).map(job => {
          const review = latestP2CandidateDigestReview(digestReviews, job);
          const reviewLabel = review?.decision === 'approved' ? '本机已复核：可用于候选上下文'
            : review?.decision === 'rejected' ? '本机已拒绝：不进入候选上下文' : '待本机复核';
          return <article key={job.jobId} data-testid="p6-digest-artifact">
            <p>{job.artifact!.summary}</p>
            <small>修订 {job.fromRevision}–{job.throughRevision} · {job.artifact!.sourceIds.length} 个来源 · {reviewLabel} · 不会授权 NPC 记忆</small>
            <details><summary>核对来源与哈希</summary>
              <ul>{job.artifact!.sourceIds.map(sourceId => <li key={sourceId}>{sourceId}</li>)}</ul>
              <small>输入 {job.inputHash} · 输出 {job.artifact!.outputHash} · 制品 {job.artifactHash}</small>
            </details>
            <div className="actions" aria-label="摘要本机人工复核">
              <button type="button" className="secondary" data-testid="p6-review-approve"
                disabled={digestBusy || actionDisabled} onClick={() => void decideDigest(job, 'approved')}>
                我已复核，纳入本机候选上下文
              </button>
              <button type="button" className="secondary" data-testid="p6-review-reject"
                disabled={digestBusy || actionDisabled} onClick={() => void decideDigest(job, 'rejected')}>
                拒绝并保留记录
              </button>
            </div>
          </article>;
        })}
        {digestJobs.some(job => job.status === 'queued' || job.status === 'running')
          && <p>未完成的摘要任务已保存在当前存档与记忆模式的本机队列中，可再次点击续跑。</p>}
      </section>
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
      <p aria-label="完整性验证">事件链：{snapshot.chainValid ? '通过' : '失败'}；规则回放：{snapshot.replayValid ? '通过' : '失败'}；记忆投影：{snapshot.memoryError ? '不可用' : '已追平'}</p>
    </>}
    {!snapshot && <p role="status">{notice}</p>}
    <button type="button" className="secondary" onClick={onBack}>返回山门</button>
  </section>;
}

function intentIdentity(save: SaveEnvelopeV3, idempotencyKey: string) {
  return { saveId: save.saveId, actorId: save.state.playerId, branchId: 'root' as const,
    expectedRevision: save.revision, idempotencyKey };
}

async function resolveP6DigestSources(
  expectedSave: SaveEnvelopeV3,
  runtime: P2ReviewGameplayRuntime,
  refs: readonly P2CandidateDigestSourceRef[],
): Promise<readonly P2CandidateDigestSource[]> {
  const latestSave = await readLocalAuthoritativeSave(expectedSave.saveId);
  if (!latestSave || latestSave.memoryMode !== expectedSave.memoryMode
    || latestSave.memoryPolicy.policyArtifactHash !== expectedSave.memoryPolicy.policyArtifactHash
    || latestSave.branchId !== expectedSave.branchId) throw new Error('P6_DIGEST_SOURCE_SAVE_CHANGED');
  const archive = await exportLocalAuthorityArchive(expectedSave.saveId, runtime.reduce);
  if (!archive) throw new Error('P6_DIGEST_SOURCE_ARCHIVE_MISSING');
  const sources = buildP2CandidateDigestSourcesFromReceipts({
    save: latestSave, receipts: archive.receipts.map(row => row.receipt), narrate: runtime.narrate,
  });
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  return refs.map(ref => {
    const source = byId.get(ref.sourceId);
    if (!source || source.revision !== ref.revision
      || source.eventIds.length !== ref.eventIds.length
      || source.eventIds.some(eventId => !ref.eventIds.includes(eventId))) {
      throw new Error('P6_DIGEST_SOURCE_NO_LONGER_AUTHORIZED');
    }
    return source;
  });
}

function previousStopFromArchive(events: readonly { sequence: number; event: { type: string; payload: Record<string, unknown> } }[]): string | undefined {
  for (const row of [...events].sort((left, right) => right.sequence - left.sequence)) {
    if ((row.event.type === 'move.arrived' || row.event.type === 'move.bypassed')
      && typeof row.event.payload.from === 'string') return row.event.payload.from;
  }
  return undefined;
}

function memoryModeLabel(mode: SaveEnvelopeV3['memoryMode']): string {
  return mode === 'forgetting' ? '真实遗忘' : '存档与继续';
}

export default P2ReviewGame;
