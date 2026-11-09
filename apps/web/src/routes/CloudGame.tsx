import {ISOLATED_PLAYTEST} from '../playtest-channel';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ActionIntentSchema, SaveEnvelopeSchema, TurnReceiptSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import { CloudHttpError, cloudRequest } from '../cloud-sync';
import { createIdempotencyKey, readActionDraft, writeActionDraft } from '../storage';
import { formatReceiptDelta, projectReceiptEvents } from '../receipt-event-view';
import { GameShell, GameInfoDialog } from '../components/GameShell';
import {CloudGameCacheBridge} from '../cloud-game-cache-bridge';
import {buildGameplayBrief} from '../gameplay-brief';
import type {ReadingPosition} from '../cloud-game-cache';
import { cloudGameDiagnostic, cloudGameErrorPlan, type CloudGameNextStep } from './cloud-game-errors';

type ActionSuggestion = { id: string; kind: string; label: string; text: string; intent?: {kind: string; payload: Record<string, unknown>} };
type PendingTurn = { idempotencyKey: string; text: string; expectedRevision: number; clarificationOf?: string; action?: {kind:string;payload:Record<string,unknown>} };
type RefreshOutcome = { rulesUnavailable: boolean; suggestionsUnavailable: boolean };
type CloudGameProps = { saveId: string; onBack: () => void; onHome: () => void; onLogin: () => void; onWorld: () => void };
const saveCannotBeRead = (error: unknown) => error instanceof CloudHttpError && (error.status === 401 || error.code === 'NOT_FOUND');
function readPendingTurn(saveId: string): PendingTurn | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`jiuxiao_cloud_pending_${saveId}`) || 'null');
    return value && typeof value.text === 'string' && value.text.length <= 8000
      && typeof value.idempotencyKey === 'string' && /^[\w-]{8,200}$/.test(value.idempotencyKey)
      && Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0
      && (value.action === undefined || ActionIntentSchema.safeParse({saveId,actorId:'pending-player',branchId:'root',expectedRevision:value.expectedRevision,idempotencyKey:value.idempotencyKey,...value.action}).success)
      && (value.clarificationOf === undefined || typeof value.clarificationOf === 'string')
      ? value as PendingTurn : null;
  } catch { return null; }
}

export function CloudGame(props: CloudGameProps) {
  return <CloudGameSession key={props.saveId} {...props} />;
}

function CloudGameSession({ saveId, onBack, onHome, onLogin, onWorld }: CloudGameProps) {
  const [showState, setShowState] = useState(false);
  const [save, setSave] = useState<SaveEnvelope | null>(null);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [receipt, setReceipt] = useState<TurnReceipt | null>(null);
  const [narrative, setNarrative] = useState('');
  const [opening, setOpening] = useState<string[]>([]);
  const [scene, setScene] = useState('行旅');
  const [inventory,setInventory]=useState<{name:string;quantity:number}[]>([]);
  const [history, setHistory] = useState<{receipt:TurnReceipt;text:string|null;source:string|null}[]>([]);
  const [historyUnavailable,setHistoryUnavailable] = useState(false);
  const [nextBefore,setNextBefore] = useState<number|null>(null);
  const [selected,setSelected] = useState<ActionSuggestion|null>(null);
  const [showActions,setShowActions] = useState(false);
  const [text, setText] = useState(() => readActionDraft(`cloud-${saveId}`));
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(true);
  const [saveNeedsRefresh, setSaveNeedsRefresh] = useState(true);
  const [failure, setFailure] = useState<{ next: CloudGameNextStep; diagnostic: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rulesUnavailable, setRulesUnavailable] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(() => readPendingTurn(saveId));
  const bridge=useRef<CloudGameCacheBridge|null>(null);
  const [cacheReady,setCacheReady]=useState(false);
  const [draftConflict,setDraftConflict]=useState<string>();
  const [readingPosition,setReadingPosition]=useState<ReadingPosition>();
  const [cacheKey,setCacheKey]=useState<string>();
  const abort=useRef(new AbortController());
  const gameRequest=useCallback(async(path:string,method='GET',body?:unknown)=>{
    const response=await cloudRequest(path,method,body,bridge.current?.scope.ownerId,abort.current.signal);
    if(abort.current.signal.aborted)throw new Error('GAME_SESSION_CHANGED');return response;
  },[]);
  useEffect(()=>{
    const invalidate=()=>{try{bridge.current?.discardJournal();}catch{}abort.current.abort();setSave(null);setHistory([]);setOpening([]);setReceipt(null);setNarrative('');setText('');setPendingTurn(null);setSuggestions([]);setCacheReady(false);setFailure({next:'account',diagnostic:'GAME_SESSION_CHANGED'});setNotice('账号已改变，请重新进入这份存档。');};
    const check=()=>{const local=bridge.current;if(!local||document.visibilityState==='hidden'||abort.current.signal.aborted)return;
      void cloudRequest('/api/auth/session').then(result=>{if((result.account as {id?:unknown}|undefined)?.id!==local.scope.ownerId)invalidate();}).catch(()=>{});};
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('jiuxiao-cloud-game-session');
    if(channel)channel.onmessage=event=>{if(event.data?.ownerId===bridge.current?.scope.ownerId&&event.data?.apiBase===bridge.current?.scope.apiBase)invalidate();};
    window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
    return()=>{abort.current.abort();channel?.close();window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
  },[]);

  const sending = useRef(false);
  const resultRegion = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState('正在读取服务端存档……');
  // P3 cache uses API/account/save scope; legacy draft is read only during owned-save migration.
  const changeText=(value:string)=>{setText(value);const current=bridge.current;if(current)void current.edit(value).then(()=>current.ready()).catch(()=>{setCacheReady(false);setNotice('草稿未保存：本机存储不可用或另一页面已修改。请保留输入并重新进入核对，当前不能提交。');});};
  const rememberPosition=useCallback((position:ReadingPosition)=>{void bridge.current?.remember(position).catch(()=>setNotice('阅读位置暂未保存，服务端进度不受影响。'));},[]);
  useEffect(() => {
    try {
      const key = `jiuxiao_cloud_pending_${saveId}`;
      if (pendingTurn) sessionStorage.setItem(key, JSON.stringify(pendingTurn));
      else sessionStorage.removeItem(key);
    } catch { /* The in-memory recovery request remains available. */ }
  }, [saveId, pendingTurn]);
  useEffect(() => { if (receipt) resultRegion.current?.scrollIntoView({ block: 'nearest' }); }, [receipt]);

  const refresh = useCallback(async (restorePresentation = false) => {
    setNotFound(false);
    setSaveNeedsRefresh(true);
    let response: Record<string, unknown>;
    try { response = await gameRequest(`/api/games/${encodeURIComponent(saveId)}`); }
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
    if(!bridge.current) {
      const session=await gameRequest('/api/auth/session');const account=session.account as {id?:unknown}|undefined;
      if(typeof account?.id!=='string')throw new Error('INVALID_SESSION');
      const local=new CloudGameCacheBridge(account.id,saveId);const cached=await local.open();bridge.current=local;
      setCacheReady(local.recoveryDraft===undefined);setDraftConflict(local.recoveryDraft);setCacheKey(cached.key);setReadingPosition(cached.position);
      if(restorePresentation){
        const migrated=cached.draft||readActionDraft(`cloud-${saveId}`);setText(migrated);
        if(!cached.draft&&migrated)await local.edit(migrated);
        const legacyPending=readPendingTurn(saveId);
        if(cached.pending)setPendingTurn(cached.pending);
        else if(!legacyPending||cached.history.some(row=>row.id===legacyPending.idempotencyKey))setPendingTurn(null);
        const last=cached.history.at(-1);if(last&&last.revision<=next.revision){setReceipt(last.receipt);setNarrative(last.text);}
        setHistory(previous=>mergeHistory(previous,cached.history.filter(row=>row.receipt.decision.status==='accepted').map(row=>({receipt:row.receipt,text:row.text,source:'local-cache'}))));
      }
    }
    if(abort.current.signal.aborted)throw new Error('GAME_SESSION_CHANGED');
    setSave(next);
    const sceneValue=response.scene as {location?:unknown;inventory?:unknown}|undefined;
    setInventory(Array.isArray(sceneValue?.inventory)?sceneValue.inventory.filter((item):item is {name:string;quantity:number}=>!!item&&typeof item.name==='string'&&Number.isSafeInteger(item.quantity)&&item.quantity>0):[]);
    if(typeof sceneValue?.location==='string')setScene(sceneValue.location);
    try {
      const archive=await gameRequest(`/api/games/${encodeURIComponent(saveId)}/story`);
      const rows=parseHistory(archive.items,saveId,next.revision);
      setHistory(previous=>mergeHistory(previous,rows));setNextBefore(typeof archive.nextBefore==='number'?archive.nextBefore:null);setHistoryUnavailable(false);
    } catch { setHistoryUnavailable(true); }

    setOpening(Array.isArray(response.opening) ? response.opening.filter((line): line is string => typeof line === 'string').slice(0, 20) : []);
    if (restorePresentation && response.latestReceipt) {
      const prior = TurnReceiptSchema.parse(response.latestReceipt);
      if (prior.saveId !== saveId || prior.resultingRevision > next.revision) throw new Error('INVALID_GAME_RESPONSE');
      setReceipt(prior);
      setNarrative('这次行动已经确认，原剧情文字暂未读取。可重试读取存档，不会再次执行行动。');
    }
    let nextRulesUnavailable = false;
    let nextSuggestionsUnavailable = false;
    try {
      const result = await gameRequest(`/api/games/${encodeURIComponent(saveId)}/action-suggestions`);
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
  }, [saveId,gameRequest]);

  useEffect(() => {
    let active = true;
    void refresh(true).then(outcome => {
      if (!active) return;
      setNotice(outcome.rulesUnavailable ? cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY')).message
        : outcome.suggestionsUnavailable ? '存档已读取；当前无法读取行动建议，你仍可直接输入行动。'
          : '服务端存档已读取。提交后请以状态回执为准。');
      const pending=bridge.current?.snapshot().pending;if(pending)void queryPendingTurn(pending);
    })
      .catch(error => {
        if (!active) return;
        setNotFound(error instanceof CloudHttpError && error.code === 'NOT_FOUND');
        setSave(null);
        setNotice(error instanceof CloudHttpError?cloudGameErrorPlan(error).message:'存档或本机记录读取失败，请确认账号、网络和浏览器存储后重新进入。未自动提交行动。');
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
    if (!save || busy || sending.current || refreshBusy || save.saveId !== saveId || (!recovering && saveNeedsRefresh)) return;
    sending.current = true;
    setPendingTurn(request);
    setBusy(true);
    setFailure(null);
    try {
      if(!bridge.current)throw new Error('GAME_CACHE_UNAVAILABLE');
      await bridge.current.prepare(request);
      setNotice(recovering ? '正在用原请求编号核对状态回执……' : '正在提交行动并等待服务器回执……');
      let result: Record<string, unknown>;
      try {
        const identity={saveId,actorId:save.state.playerId,branchId:'root',expectedRevision:request.expectedRevision,idempotencyKey:request.idempotencyKey,
          ...(request.clarificationOf?{clarificationOf:request.clarificationOf}:{})};
        result = request.action ? await gameRequest('/api/turns','POST',{
          intent:ActionIntentSchema.parse({...identity,kind:request.action.kind,payload:request.action.payload}),requestNarrative,
        }) : await gameRequest(`/api/games/${encodeURIComponent(saveId)}/turns`, 'POST', {
          text: request.text, expectedRevision:request.expectedRevision,idempotencyKey:request.idempotencyKey,
          ...(request.clarificationOf?{clarificationOf:request.clarificationOf}:{}),requestNarrative,
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
        if(!recovering&&plan.next!=='same-request')await bridge.current!.abandonBeforeSettlement(request.idempotencyKey);
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
      const local=await bridge.current.finish(request.idempotencyKey,nextReceipt,typeof resultNarrative?.text==='string'?resultNarrative.text:decision.status==='clarify'?decision.question:decision.status==='rejected'?decision.message:'行动已确认。');
      setPendingTurn(null);
      if(decision.status==='accepted') {
        const received=typeof resultNarrative?.text==='string'?resultNarrative.text:null;
        setHistory(previous=>mergeHistory(previous,[{receipt:nextReceipt,text:received,source:typeof resultNarrative?.source==='string'?resultNarrative.source:null}]));
      }
      setSelected(null);
      setText(local.draft);
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
    } catch {
      setPendingTurn(request);setFailure({next:'same-request',diagnostic:'GAME_CACHE_UNAVAILABLE'});
      setNotice('本机记录未能确认保存，原请求已保留。请先查询服务端结果，避免重复行动。');
    } finally {
      sending.current = false;
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
      ...(selected?.intent && selected.text.trim()===utterance ? {action:selected.intent}:{}),
    };
    await sendTurn(request, true, false);
  }

  async function queryPendingTurn(known?:PendingTurn) {
    const target=known??pendingTurn;
    if(!target||busy||(!known&&refreshBusy))return;
    setBusy(true);
    try {
      const result=await gameRequest(`/api/games/${encodeURIComponent(saveId)}/receipts/${target.idempotencyKey}`);
      if(result.status!=='confirmed'||!result.receipt){setNotice('尚未查询到回执，结果仍待核实。可以再次查询，或用原请求编号核对。');return;}
      const confirmed=TurnReceiptSchema.parse(result.receipt);
      if(confirmed.saveId!==saveId||confirmed.idempotencyKey!==target.idempotencyKey)throw new Error('INVALID_RECEIPT');
      const local=await bridge.current?.finish(target.idempotencyKey,confirmed,'服务端已确认此行动；原正文将从剧情记录读取。');
      if(!local)throw new Error('GAME_CACHE_UNAVAILABLE');
      setReceipt(confirmed);setPendingTurn(null);setText(local.draft);await refresh();setNotice('已从服务端恢复回执；没有重新结算。');
    }catch{setNotice('暂时无法查询，待决请求保持不变。');}finally{setBusy(false);}
  }
  async function reconcilePendingTurn() {
    if (!pendingTurn || busy) return;
    // requestNarrative is presentation-only; keep the same action fingerprint/key
    // and omit another model call while resolving an ambiguous transport result.
    await sendTurn(pendingTurn, false, true);
  }

  function chooseSuggestion(item:ActionSuggestion) {
    changeText(item.text);setSelected(item);setShowActions(false);
    document.getElementById('p2-action-input')?.focus();
  }
  function suggestionButton(item:ActionSuggestion) {
    return <button type="button" className="story-suggestion" key={item.id}
      disabled={busy||refreshBusy||saveNeedsRefresh||!!pendingTurn||rulesUnavailable} onClick={()=>chooseSuggestion(item)}>{item.label}</button>;
  }
  async function loadEarlier() {
    if(nextBefore===null||!save)return;
    try{const result=await gameRequest(`/api/games/${encodeURIComponent(saveId)}/story?before=${nextBefore}`);
      setHistory(previous=>mergeHistory(previous,parseHistory(result.items,saveId,save.revision)));
      setNextBefore(typeof result.nextBefore==='number'?result.nextBefore:null);
    }catch{setNotice('较早的经历暂时无法读取，请稍后重试。');}
  }
  const eventRows=projectReceiptEvents(receipt);
  const currentInHistory=history.some(row=>row.receipt.idempotencyKey===receipt?.idempotencyKey&&!!row.text);
  const canAct=cacheReady&&!!save&&!busy&&!refreshBusy&&!saveNeedsRefresh&&!pendingTurn&&!rulesUnavailable;
  return <GameShell saveId={saveId} readingReady={!!save&&cacheReady&&!refreshBusy} immersive readingScope={cacheKey} readingPosition={readingPosition} onReadingPositionChange={rememberPosition}>
    <header className="story-header"><div><span className="eyebrow">{ISOLATED_PLAYTEST?'九霄 · 隔离试玩':'九霄 · 行旅'}</span><h1>{scene}</h1></div>
      <div className="story-utilities"><span aria-live="polite">{busy?'正在记录…':pendingTurn?'结果待确认':save?(historyUnavailable?'进度已保存':'经历已保存'):'正在读取…'}</span>
      <button className="quiet-action" onClick={()=>setShowState(true)}>人物 · 行囊</button><button className="quiet-action" onClick={onBack}>离开此局</button></div>
    </header>
    <div className="story-first-workspace" data-testid="p2-cloud-game">
      <div className="story-reading" role="region" tabIndex={0} aria-label="剧情记录">
        {nextBefore!==null&&<button className="quiet-action" onClick={()=>void loadEarlier()}>读取更早的经历</button>}
        {save&&!!opening.length&&<article className="story-prose" data-reading-id="opening" aria-label="故事开场">{opening.map((line,index)=><p key={index}>{line}</p>)}</article>}
        {save&&history.map(row=><article className="story-prose story-history-entry" data-reading-id={row.receipt.idempotencyKey} data-story-revision={row.receipt.resultingRevision} key={row.receipt.idempotencyKey}>
          <span className="story-turn-kind">{turnLabel(row.receipt)}{row.source==='local-cache'?' · 本机保留的原文':''}</span>
          {row.text?<div data-testid={row.receipt.idempotencyKey===receipt?.idempotencyKey?'p2-narrative':undefined}>{row.text.split(/\n+/).map((line,index)=><p key={index}>{line}</p>)}</div>
            :<p className="quiet-note">这段经历的原剧情尚未留存，行动记录仍在。</p>}
        </article>)}
        {save&&receipt&&receipt.decision.status!=='accepted'&&<section data-reading-id={receipt.idempotencyKey} ref={resultRegion} className="story-action-feedback" aria-live="polite">
          <h2>{receipt.decision.status==='clarify'?'再说具体一点':'这次没有做到'}</h2>
          <p data-testid="p2-narrative">{receipt.decision.status==='rejected'?receipt.decision.message:'这次行动尚未执行。请补充想去的地点、想观察的对象或想说的话，也可以选下方的一项行动。'}</p>
          {receipt.decision.status==='clarify'&&'candidates' in receipt.decision&&receipt.decision.candidates.length>0&&<ul>{receipt.decision.candidates.map((candidate,index)=><li key={index}>{candidate.label}</li>)}</ul>}
        </section>}
        {save&&!!narrative&&!currentInHistory&&receipt?.decision.status==='accepted'&&<section data-reading-id={receipt?.idempotencyKey} ref={resultRegion} className="story-prose" aria-live="polite"><p data-testid="p2-narrative">{narrative}</p></section>}
        {!save&&<section className="story-action-feedback"><h2>{notFound?'找不到这份存档':'行旅尚未载入'}</h2><p data-testid="p2-status" role="status">{notice}</p><div className="actions"><button onClick={()=>void reloadSave()} disabled={refreshBusy}>重新读取存档</button><button onClick={notFound?onHome:onLogin}>{notFound?'回到首页':'账号与云档'}</button></div></section>}
        <section className="story-reading-end" ref={receipt?.decision.status==='accepted'?resultRegion:undefined} />
      </div>
      {save&&<section className={`story-action-area${pendingTurn&&!busy?' story-awaiting-confirmation':''}`} aria-label="接下来怎么做">
        {draftConflict!==undefined&&<details open className="story-draft-conflict"><summary>还有一段未保存的输入</summary><p>另一页面已保存不同草稿。请先复制下面这段文字保留，再核对已保存的草稿；当前不能提交行动。</p><textarea aria-label="尚未保存的输入" readOnly value={draftConflict}/><button type="button" onClick={()=>{bridge.current?.discardJournal();window.location.reload();}}>使用已保存的草稿</button></details>}
        <p className="story-action-instruction">你可以描述自己的行动，九霄会根据当前世界规则决定结果。</p>
        <div className="story-suggestions" aria-label="可编辑的行动建议">{suggestions.slice(0,3).map(suggestionButton)}{suggestions.length>1&&<button type="button" className={`story-suggestion${suggestions.length>3?'':' story-more-compact'}`} onClick={()=>setShowActions(true)}>更多行动</button>}</div>
        <form className="story-composer" aria-busy={busy||refreshBusy} onSubmit={submit}>
          <label htmlFor="p2-action-input">接下来，你想怎么做？</label>
          <textarea id="p2-action-input" data-testid="p2-action-input" value={text} placeholder="例如：观察渡船。点击建议后也可以修改文字。" maxLength={8000} onChange={event=>{changeText(event.target.value);setSelected(null);}} disabled={!save||!cacheReady||busy||refreshBusy||rulesUnavailable}/>
          <button type="submit" className="primary" data-testid="p2-submit-action" disabled={!canAct||!text.trim()}>{busy?'正在判定行动…':'确认行动 · 继续故事'}</button>
        </form>
        {historyUnavailable&&!pendingTurn&&<button className="quiet-action story-history-retry" disabled={busy||refreshBusy} onClick={()=>void reloadSave()}>重读剧情记录</button>}
        <div className="story-save-feedback" role="status" aria-live="polite">{busy?'正在处理这次行动，请稍候。':pendingTurn?'本次结果尚未确认，内容已保留。':receipt?.decision.status==='clarify'?'世界没有变化，可以补充后继续。':receipt?.decision.status==='rejected'?'世界没有变化，请调整行动。':save?(historyUnavailable?'进度已保存；剧情记录暂不可用，请重试读取。':'已保存当前经历。'):''}</div>
        {pendingTurn&&!busy&&<section className="story-action-feedback" role="alert"><p>结果待确认，请先查询或核对本次提交。</p><div className="story-recovery-actions"><button type="button" disabled={busy||refreshBusy} onClick={()=>void reconcilePendingTurn()}>核对本次提交</button><button type="button" disabled={busy||refreshBusy} onClick={()=>void queryPendingTurn()}>查询行动结果</button></div></section>}
        {failure&&!pendingTurn&&<section className="story-action-feedback"><p>{notice}</p>{failure.next==='account'?<button onClick={onLogin}>账号与云档</button>:failure.next==='home'?<button onClick={onBack}>查看存档列表</button>:<button disabled={busy||refreshBusy} onClick={()=>void reloadSave()}>重新读取存档</button>}</section>}
        {rulesUnavailable&&!pendingTurn&&<section className="story-action-feedback"><p>当前环境的剧情规则尚未开放，行动已暂停。</p><button disabled={refreshBusy||busy} onClick={()=>void reloadSave()}>重新读取存档</button></section>}
        <details className="story-help"><summary>玩法范围与规则记录</summary><nav aria-label="法律链接"><a href="/privacy">隐私政策</a> · <a href="/privacy-rights">隐私权利</a> · <a href="/terms">用户协议</a></nav>
          <p>当前支持已列出的移动、观察、交谈及物品和任务操作，暂时不能理解所有自然语言表达。修改建议文字后，会重新判断其含义。</p>
          <p>自动保存已确认的行动；结果不确定时请先核对。{historyUnavailable?'本环境未开启或暂时无法读取完整剧情保存。':''}</p>
          <p data-testid="p3-world-brief">{save?buildGameplayBrief(save,receipt,suggestions).questStatus:''}</p>
          <button className="quiet-action" onClick={onWorld}>阅读世界资料</button>
          <section aria-label="服务端存档状态"><p>存档版本 <strong data-testid="p2-revision">{save.revision}</strong> · 行旅时间 <strong data-testid="p2-game-minute">{String(save.state.facts.gameMinute??'未记录')}</strong></p>
          {save.schemaVersion===3&&<p>{save.memoryMode==='forgetting'?'真实遗忘':'存档与继续'}</p>}</section>
          <p data-testid="p2-status">{notice}</p>
          {receipt&&<section data-testid="p2-receipt"><p>{receipt.decision.status==='accepted'?'行动已执行。':receipt.decision.status==='clarify'?'还需要补充说明。':'行动未执行。'}</p>
          {eventRows.length?<ul>{eventRows.map(event=><li key={event.eventId}>{event.delta?formatReceiptDelta(event.delta):'存档状态已记录。'}</li>)}</ul>:<p>存档状态没有变化。</p>}
          <p>请求 {receipt.idempotencyKey} · 修订 {receipt.resultingRevision}</p></section>}
          {failure&&<p>{failure.diagnostic}</p>}
        </details>
      </section>}
    </div>
    {showActions&&<GameInfoDialog label="当前可以尝试" onClose={()=>setShowActions(false)}><p>选择一项填入行动框，确认后才会执行。</p><div className="story-all-actions">{suggestions.map(suggestionButton)}</div></GameInfoDialog>}
    {showState&&save&&<GameInfoDialog label="人物与行囊" onClose={()=>setShowState(false)}><p>当前地点：{scene}</p><p>体力：{String(save?.state.facts.stamina??'未记录')}</p><h2>行囊</h2>{inventory.length?<ul>{inventory.map(item=><li key={item.name}>{item.name} ×{item.quantity}</li>)}</ul>:<p>暂无可显示的随身物品。</p>}<p>人物身份、修为等建角资料尚未映射到服务器规则状态。</p><details><summary>存档与技术详情</summary><pre>{JSON.stringify(save,null,2)}</pre></details><button className="quiet-action" onClick={onLogin}>账号与存档管理</button></GameInfoDialog>}
  </GameShell>;
}

type HistoryEntry={receipt:TurnReceipt;text:string|null;source:string|null};
function parseHistory(value:unknown,saveId:string,revision:number):HistoryEntry[] {
 if(!Array.isArray(value)||value.length>100)throw new Error('INVALID_STORY_HISTORY');
 return value.map(raw=>{if(!raw||typeof raw!=='object')throw new Error('INVALID_STORY_HISTORY');const row=raw as Record<string,unknown>;
  const receipt=TurnReceiptSchema.parse(row.receipt);if(receipt.saveId!==saveId||receipt.decision.status!=='accepted'||receipt.resultingRevision>revision)throw new Error('INVALID_STORY_HISTORY');
  if(row.text!==null&&(typeof row.text!=='string'||row.text.length>100000))throw new Error('INVALID_STORY_HISTORY');
  return {receipt,text:row.text as string|null,source:typeof row.source==='string'?row.source:null};});
}
function mergeHistory(previous:HistoryEntry[],rows:HistoryEntry[]):HistoryEntry[]{
 const merged=new Map(previous.map(row=>[row.receipt.idempotencyKey,row]));for(const row of rows){const prior=merged.get(row.receipt.idempotencyKey);merged.set(row.receipt.idempotencyKey,row.text===null&&prior?.source==='local-cache'?prior:row);}
 return [...merged.values()].sort((a,b)=>a.receipt.resultingRevision-b.receipt.resultingRevision);
}
function turnLabel(receipt:TurnReceipt):string {
 if(receipt.decision.status!=='accepted')return '行旅';
 const event=receipt.decision.events[0]?.type??'';
 return event.startsWith('talk.')?'交谈':event.startsWith('observe.')?'观察':event.startsWith('move.')?'行路':event.startsWith('quest.')?'任务':'行旅';
}
