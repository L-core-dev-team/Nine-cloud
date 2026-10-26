import { validateGameReceipt } from './game-receipt-validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DecisionV2Schema, SaveEnvelopeSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import { apiRequestUrl } from './api-url';
import { CloudHttpError, cloudRequest } from './cloud-sync';
import { cloudGameErrorPlan } from './routes/cloud-game-errors';
import { IndexedGameCache, beginGameAction, editGameDraft, finishGameAction, type GameCache, type GameCacheScope, type ReadingPosition } from './cloud-game-cache';

const store = new IndexedGameCache();
export type GameActionSuggestion = { id: string; kind: string; label: string; text: string };
export function gameCacheScope(ownerId: string, saveId: string): GameCacheScope {
  return { apiBase: new URL(apiRequestUrl('/api'), window.location.href).href, ownerId, saveId };
}
export class CloudGameAccountCleanupError extends Error {
  constructor(public cacheCleared: boolean, public notified: boolean) {
    super('GAME_ACCOUNT_CLEANUP_INCOMPLETE');
  }
}
export async function clearCloudGameAccount(ownerId: string) {
  const scope = gameCacheScope(ownerId, 'account-cleanup');
  let cacheCleared = false, notified = false;
  try { await store.clearAccount(scope); cacheCleared = true; } catch { /* Still invalidate other tabs. */ }
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('jiuxiao-cloud-game-session');
      channel.postMessage({ ownerId, apiBase: scope.apiBase }); notified = true;
    }
  } catch { /* Notification failure must not prevent server logout. */ }
  finally { try { channel?.close(); } catch { /* Sending and closing are independent. */ } }
  if (!cacheCleared || !notified) throw new CloudGameAccountCleanupError(cacheCleared, notified);
}
export function useCloudGameSession(saveId: string) {
  const [save, setSave] = useState<SaveEnvelope | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cache, setCache] = useState<GameCache | null>(null);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<GameActionSuggestion[]>([]);
  const [busy, setBusy] = useState(true);
  const [rulesUnavailable, setRulesUnavailable] = useState(false);
  const [notice, setNotice] = useState('正在读取存档与本机阅读记录……');
  const active = useRef<{ scope: GameCacheScope; epoch: number; cache: GameCache; abort: AbortController; working: boolean } | null>(null);
  const draftWrites = useRef<Promise<void>>(Promise.resolve());
  const draftFailed = useRef(false);
  const isCurrent = (session: NonNullable<typeof active.current>) => active.current === session && !session.abort.signal.aborted;
  const publish = (session: NonNullable<typeof active.current>, value: GameCache) => {
    session.cache = value;
    if (isCurrent(session)) setCache(value);
  };
  async function loadSave(session: NonNullable<typeof active.current>) {
    const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}`, 'GET', undefined, session.scope.ownerId, session.abort.signal);
    const value = SaveEnvelopeSchema.parse(result.save);
    if (value.saveId !== saveId) throw Error('INVALID_GAME_RESPONSE');
    if (isCurrent(session)) setSave(value);
    let blocked = false;
    const available = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/action-suggestions`, 'GET', undefined, session.scope.ownerId, session.abort.signal).catch(error => {
      if (error instanceof CloudHttpError && [401, 404].includes(error.status)) throw error;
      blocked = error instanceof CloudHttpError && error.code === 'RULES_NOT_READY';
      return { actions: [] };
    });
    if (!isCurrent(session)) return { save: value, rulesUnavailable: blocked };
    setRulesUnavailable(blocked);
    setSuggestions(Array.isArray(available.actions) ? available.actions.filter((a): a is GameActionSuggestion => !!a && typeof a === 'object' && ['id', 'kind', 'label', 'text'].every(k => typeof (a as Record<string, unknown>)[k] === 'string')) : []);
    return { save: value, rulesUnavailable: blocked };
  }
  async function lookup(session: NonNullable<typeof active.current>) {
    const pending = session.cache.pending;
    if (!pending) return;
    const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/receipts/${pending.idempotencyKey}`, 'GET', undefined, session.scope.ownerId, session.abort.signal);
    if (!isCurrent(session)) return;
    if (result.status === 'confirmed' && result.receipt) {
      const { save: authoritative } = await loadSave(session);
      await validateGameReceipt(session.scope, pending, authoritative, result.receipt);
      if (!isCurrent(session)) return;
      const value = await store.change(session.scope, session.epoch, current => finishGameAction(current, session.scope, pending.idempotencyKey, result.receipt, '服务端已确认此行动；原叙述未保存在本机，可查看规则回执。'));
      if (!isCurrent(session)) return;
      publish(session, value); setText(value.draft);
      await loadSave(session);
      if (isCurrent(session)) setNotice('已从服务端恢复回执；没有重新结算。');
      return 'confirmed';
    }
    if (result.status !== 'unknown' || result.receipt !== null) throw Error('INVALID_RECEIPT_LOOKUP');
    setNotice('尚未查询到回执，结果仍待核实。可以再次查询，或明确选择使用原请求标识重试。');
    return 'unknown';
  }
  useEffect(() => {
    const abort = new AbortController(); let disposed = false;
    const invalidate = () => { if (disposed || abort.signal.aborted) return; active.current = null; abort.abort(); setSave(null); setCache(null); setText(''); setSuggestions([]); setBusy(false); setNotice('账号已改变，请重新进入这份存档。'); };
    const checkSession = () => {
      const session = active.current; if (!session || document.visibilityState === 'hidden') return;
      void cloudRequest('/api/auth/session').then(result => {
        if (isCurrent(session) && (result.account as { id?: unknown } | undefined)?.id !== session.scope.ownerId) {
          invalidate(); void clearCloudGameAccount(session.scope.ownerId).catch(() => { /* The view is already invalidated. */ });
        }
      }).catch(error => {
        if (isCurrent(session) && error instanceof CloudHttpError && error.status === 401) invalidate();
        // A network failure alone does not establish a different account.
      });
    };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('jiuxiao-cloud-game-session');
    if (channel) channel.onmessage = event => { const session = active.current;
      if (session && event.data?.ownerId === session.scope.ownerId && event.data?.apiBase === session.scope.apiBase) invalidate(); };
    window.addEventListener('focus', checkSession); document.addEventListener('visibilitychange', checkSession);
    setSave(null); setCache(null); setText(''); setSuggestions([]); setBusy(true); setNotFound(false); setRulesUnavailable(false); draftFailed.current = false;
    draftWrites.current = Promise.resolve();
    void (async () => {
      const response = await cloudRequest('/api/auth/session', 'GET', undefined, undefined, abort.signal);
      const account = response.account as { id?: unknown } | undefined;
      if (typeof account?.id !== 'string') throw Error('INVALID_SESSION');
      const scope = gameCacheScope(account.id, saveId);
      const cached = await store.read(scope);
      if (disposed || abort.signal.aborted) return;
      const session = { scope, epoch: cached.epoch, cache: cached, abort, working: false };
      active.current = session; publish(session, cached); setText(cached.draft);
      const outcome = await loadSave(session);
      if (!isCurrent(session)) return;
      setNotice(outcome.rulesUnavailable ? cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message : '存档已恢复。行动由服务端规则判定。');
      if (cached.pending) await lookup(session); // GET only: never automatically re-submit on mount.
    })().catch(error => { if (!disposed && !abort.signal.aborted) {
      if (error instanceof CloudHttpError && [401, 404].includes(error.status)) { setSave(null); setCache(null); setText(''); setSuggestions([]); }
      if (error instanceof CloudHttpError && error.status === 404) setNotFound(true);
      setNotice(error instanceof CloudHttpError ? cloudGameErrorPlan(error).message : '存档或本机记录读取失败，请确认账号、网络及浏览器存储后重新进入。未自动提交任何行动。');
    } })
      .finally(() => { if (!disposed && !abort.signal.aborted) setBusy(false); });
    return () => { disposed = true; abort.abort(); channel?.close(); window.removeEventListener('focus', checkSession); document.removeEventListener('visibilitychange', checkSession); if (active.current?.abort === abort) active.current = null; };
  }, [saveId]);
  function edit(value: string) {
    const session = active.current; if (!session || value.length > 8000) return;
    setText(value);
    draftWrites.current = draftWrites.current.then(async () => {
      if (!isCurrent(session)) return;
      const next = await store.change(session.scope, session.epoch, current => editGameDraft(current, value, session.cache.draftVersion));
      publish(session, next); draftFailed.current = false;
    }).catch(() => { if (isCurrent(session)) { draftFailed.current = true; setNotice('草稿未保存：存储不可用、空间不足或其他页面已修改。请保留输入并重新进入核对，当前不能提交。'); } });
  }
  async function submit(retry = false) {
    const session = active.current; if (!session || !save || busy || session.working || rulesUnavailable) return;
    session.working = true;
    setBusy(true);
    let attempted: string | undefined;
    try {
      await draftWrites.current;
      if (!isCurrent(session) || draftFailed.current) return;
      // Explicit same-key retry still queries first; a confirmed action is never sent again.
      if (retry && await lookup(session) !== 'unknown') return;
      if (!isCurrent(session)) return;
      if (!retry) {
        const lastDecision = DecisionV2Schema.safeParse(session.cache.history.at(-1)?.receipt.decision);
        const clarificationOf = lastDecision.success && lastDecision.data.status === 'clarify' && lastDecision.data.revision === save.revision ? lastDecision.data.interactionId : undefined;
        publish(session, await store.change(session.scope, session.epoch, current => beginGameAction(current, {
          text: current.draft.trim(), expectedRevision: save.revision, idempotencyKey: crypto.randomUUID(), requestNarrative: true,
          draftVersion: current.draftVersion, delivery: 'prepared',
          ...(clarificationOf ? { clarificationOf } : {}),
        })));
      }
      if (!isCurrent(session) || !session.cache.pending) return;
      publish(session, await store.change(session.scope, session.epoch, current => ({ ...current, pending: current.pending ? { ...current.pending, delivery: 'sent' } : null })));
      const pending = session.cache.pending!;
      attempted = pending.idempotencyKey;
      const { draftVersion: _draft, delivery: _delivery, ...body } = pending;
      setNotice('正在判定；等待服务端规则回执。');
      const result = await cloudRequest(`/api/games/${encodeURIComponent(saveId)}/turns`, 'POST', body, session.scope.ownerId, session.abort.signal);
      if (!isCurrent(session)) return;
      const narrative = result.narrative as { text?: unknown; status?: string } | undefined;
      const decision = (await validateGameReceipt(session.scope, pending, save, result.receipt)).decision;
      if (!isCurrent(session)) return;
      const next = await store.change(session.scope, session.epoch, current => finishGameAction(current, session.scope, pending.idempotencyKey, result.receipt,
        typeof narrative?.text === 'string' ? narrative.text : decision.status === 'clarify' ? decision.question : decision.status === 'rejected' ? decision.message : '行动判定已保存，请查看规则回执。'));
      if (!isCurrent(session)) return;
      publish(session, next); setText(next.draft);
      const outcome = await loadSave(session);
      if (isCurrent(session)) setNotice(outcome.rulesUnavailable ? cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message : next.history.at(-1)?.receipt.decision.status === 'accepted'
        ? narrative?.status === 'failed' ? '规则已结算，叙事失败；权威结果已保存，不需重新行动。' : '规则结算已保存。'
        : next.history.at(-1)?.receipt.decision.status === 'clarify' ? '需要补充信息，世界未推进。' : '服务端明确拒绝，世界未推进；原文保留。');
    } catch (error) {
      if (isCurrent(session) && attempted && session.cache.history.some(row => row.id === attempted)) {
        setSave(null);
        setNotice('行动回执已收到，但最新存档暂未读取。请重新进入核对，不要重复提交这次行动。');
        return;
      }
      let released = false;
      if (isCurrent(session) && attempted && error instanceof CloudHttpError && error.status === 409 && error.code === 'REVISION_CONFLICT') {
        try {
          // A definitive version rejection is not an unknown network result. Check for a winning duplicate first.
          const pending = session.cache.pending;
          const recovery = await lookup(session);
          if (recovery === 'unknown' && isCurrent(session) && pending && session.cache.pending?.idempotencyKey === attempted) {
            const { save: currentSave } = await loadSave(session);
            if (isCurrent(session) && currentSave.revision > pending.expectedRevision) {
              const next = await store.change(session.scope, session.epoch, current => {
                if (current.pending?.idempotencyKey !== attempted) throw Error('GAME_ACTION_CHANGED');
                return { ...current, pending: null };
              });
              if (isCurrent(session)) { publish(session, next); setText(next.draft); released = true;
                setNotice('服务端已拒绝旧版本行动，最新存档已读取；草稿保留。请核对后自行提交，未自动重试。'); }
            }
          } else if (isCurrent(session) && !session.cache.pending) released = true;
        } catch { /* Failed lookup, mismatched receipt or logout keeps the original request unresolved. */ }
      }
      if (isCurrent(session) && !released) {
        if (error instanceof CloudHttpError && [401, 404].includes(error.status)) { setSave(null); setCache(null); setText(''); setSuggestions([]); setNotFound(error.status === 404); }
        if (error instanceof CloudHttpError && error.code === 'RULES_NOT_READY') setRulesUnavailable(true);
        setNotice(error instanceof CloudHttpError ? `${cloudGameErrorPlan(error).message} 原请求仍保留，请查询原请求结果后再继续。` : '请求未确认或本机保存失败，原请求已保留。请先查询服务端结果，不能另起一次行动。');
      }
    }
    finally { session.working = false; if (isCurrent(session)) setBusy(false); }
  }
  async function queryPending() {
    const session = active.current; if (!session || busy || session.working) return; session.working = true; setBusy(true);
    try { await lookup(session); } catch (error) { if (isCurrent(session)) {
      if (error instanceof CloudHttpError && [401, 404].includes(error.status)) { setSave(null); setCache(null); setText(''); setSuggestions([]); setNotFound(error.status === 404); }
      setNotice(error instanceof CloudHttpError ? `${cloudGameErrorPlan(error).message} 待决请求保持不变。` : '暂时无法查询，待决请求保持不变。');
    } }
    finally { session.working = false; if (isCurrent(session)) setBusy(false); }
  }
  const rememberPosition = useCallback((position: ReadingPosition) => {
    const session = active.current; if (!session) return;
    void store.change(session.scope, session.epoch, current => ({ ...current, position })).catch(() => {
      if (isCurrent(session)) setNotice('阅读位置未能保存在此设备；服务端存档不受影响。');
    });
  }, []);
  return { save, notFound, cache, text, edit, busy, rulesUnavailable, notice, suggestions, submit, queryPending, rememberPosition };
}
