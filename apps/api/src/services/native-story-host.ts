import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool } from 'pg';
import { ActionIntentSchema, type ActionIntent, TurnReceiptSchema, WorldStateSchema, type TurnReceipt } from '@jiuxiao/contracts';
import { prepareTurn } from '@jiuxiao/domain';
import { buildNarrativeMemoryContext } from './narrative-memory-context.js';
import type { NarrativeContext } from './narrative-scheduler.js';
import { buildP1NarrativeHints, ensureP1NarrativeHints } from './p1-narrative-hints.js';
import { StoryArchive } from './story-archive.js';
import { ServerTurnService, type ServerTurnRepository } from './server-turn.js';
import type { prepareTurnRuntime } from './turn-runtime.js';

type Runtime = ReturnType<typeof prepareTurnRuntime>;
export interface PublicStoryWire {
  model:'gpt-6-luna'; reasoning_effort:'none'; max_completion_tokens:512; service_tier:'default'; stream:false; store:false;
  messages:Array<{role:'developer'|'assistant'|'user';content:string}>;
}
type LocalStoryProvider = (wire:PublicStoryWire, receipt:TurnReceipt, signal:AbortSignal) => Promise<string>;

/** Local host injection only. The ordinary Node entry omits the final argument. */
export function nativeTurnService(pool:Pool, repo:ServerTurnRepository, runtime?:Runtime, archive?:StoryArchive, projected?:LocalStoryProvider,
  verifiedUnsentAction?: (owner:string, saveId:string, key:string) => Promise<ActionIntent | null>) {
  const narrator = runtime?.narrator, fallback = runtime?.narrativeFallback;
  if (!projected) {
    const retained = archive && narrator ? ((...args:Parameters<typeof narrator>) => archive.retain(args[0],'model',
      async () => ensureP1NarrativeHints(await narrator(...args),args[0],args[2] ?? {npcMemories:[]}))) : narrator;
    const retainedFallback = archive && fallback ? ((...args:Parameters<typeof fallback>) => archive.retain(args[0],'deterministic',
      () => ensureP1NarrativeHints(fallback(...args),args[0],args[1]))) : fallback;
    return new ServerTurnService(repo,runtime?.rules,retained,120_000,retainedFallback);
  }
  if (!archive || !runtime || !['test','development'].includes(process.env.NODE_ENV ?? '')) throw Error('LOCAL_PROJECTED_STORY_ONLY');
  // The projected attempt is journalled exactly once by the archive claim, including after a crash.
  const {recordNarrativeStatus: _presentationLog, ...repository} = repo;
  const currentAction = new AsyncLocalStorage<ActionIntent>();
  class LocalProjectedTurns extends ServerTurnService {
    override execute(owner:string, raw:unknown, narrative=false, signal?:AbortSignal) {
      const intent = ActionIntentSchema.parse(raw);
      return currentAction.run(intent, () => super.execute(owner,intent,narrative,signal));
    }
  }
  const render = (receipt:TurnReceipt, signal:AbortSignal, context:NarrativeContext = {npcMemories:[]}, recovery=false) =>
    archive.retain(receipt,'model',async () => {
      const current = await pool.query('SELECT snapshot FROM game_saves WHERE id=$1 AND revision=$2',[receipt.saveId,receipt.resultingRevision]);
      const action = currentAction.getStore();
      if (!current.rowCount || !action || action.saveId !== receipt.saveId || action.idempotencyKey !== receipt.idempotencyKey) throw Error('MATCHING_COMMITTED_STATE_REQUIRED');
      const prior = await pool.query(`SELECT r.result,n.narrative_text FROM turn_requests r LEFT JOIN story_narratives n
        ON n.save_id=r.save_id AND n.idempotency_key=r.idempotency_key
        WHERE r.save_id=$1 AND r.result->>'branchId'=$2 AND r.result->'decision'->>'status'='accepted'
        AND (r.result->>'resultingRevision')::int=$3`,[receipt.saveId,'root',receipt.resultingRevision-1]);
      if (prior.rows.length > 1) throw Error('AMBIGUOUS_PREVIOUS_TURN');
      const row = prior.rows[0];
      const {publicPrologueReceipt} = await import('./prologue-public-receipt.js');
      const view = publicPrologueReceipt(receipt,WorldStateSchema.parse(current.rows[0].snapshot),row && TurnReceiptSchema.parse(row.result));
      const messages:PublicStoryWire['messages'] = [{role:'developer',content:'面向玩家写连续的中文修仙叙事正文。上一段仅用于文脉，本轮已提交的事实以本轮回执为准。保留未作出的选择。'}];
      // An intervening NPC cannot inherit the narrator's private/player-only prose.
      const directTalk = receipt.decision.status === 'accepted' && receipt.decision.events.some(e => e.type === 'talk.occurred');
      if (row?.narrative_text && !directTalk) messages.push({role:'assistant',content:row.narrative_text});
      messages.push({role:'user',content:JSON.stringify({玩家行动:action.kind === 'free_text' ? action.payload.text : {kind:action.kind,...action.payload},
        instruction:'只叙述已提交回执中的结果。npcMemories 是按 NPC 授权和存档记忆策略过滤后的观察，只能帮助对应 NPC 表达，不得改变回执中的事实、规则结果或玩家状态。npcUtterances 是绑定当前直接发言 NPC 的作者文本，逐字保留，不得转给其他 NPC。playerConditionLines 是规则投影允许呈现的玩家身体状态，只用于描述，不可推断原因或改变事实。没有被检索出的记忆不代表事件没有发生。候选文本仅是表达建议，不得新增权威状态或规则。',role:'story',receipt:view,npcMemories:context.npcMemories,
        playerConditionLines:context.playerConditionLines ?? [],npcUtterances:context.npcUtterances ?? [],candidates:{}})});
      const wire:PublicStoryWire = {model:'gpt-6-luna',messages,reasoning_effort:'none',max_completion_tokens:512,service_tier:'default',stream:false,store:false};
      signal.throwIfAborted();
      return ensureP1NarrativeHints(await projected(wire,receipt,signal),receipt,context);
    },recovery ? 'recover-unsent' : true);
  const turns = new LocalProjectedTurns(repository,runtime.rules,render,120_000);
  if (!verifiedUnsentAction) return turns;
  return Object.assign(turns, {
    async recoverStory(owner:string, saveId:string, key:string, signal:AbortSignal) {
      const receipt = await repo.getReceiptForOwner(owner,saveId,key);
      if (!receipt || receipt.decision.status !== 'accepted') return null;
      const save = await repo.loadSave(owner,saveId);
      if (!save || save.ruleVersion !== runtime.rules.ruleVersion || save.schemaVersion === 1) return null;
      const original = await verifiedUnsentAction(owner,saveId,key);
      if (!original) return null;
      const intent = ActionIntentSchema.parse(original);
      if (intent.saveId !== saveId || intent.idempotencyKey !== key || intent.actorId !== save.state.playerId)
        throw Error('STORY_REQUEST_MISMATCH');
      // Reuse the original fingerprint check. Neither callback is permitted to settle a turn.
      const forbid = ():never => { throw Error('STORY_REQUIRES_EXISTING_RECEIPT'); };
      const replay = await prepareTurn({intent,save,priorReceipt:receipt,decide:forbid,reduce:forbid});
      if (replay.status !== 'duplicate') throw Error('STORY_REQUEST_MISMATCH');
      const stored = await pool.query('SELECT narrative_text FROM story_narratives WHERE save_id=$1 AND idempotency_key=$2',[saveId,key]);
      if (stored.rowCount) return {text:String(stored.rows[0].narrative_text),revision:receipt.resultingRevision};
      if (save.revision !== receipt.resultingRevision) throw Error('MATCHING_COMMITTED_STATE_REQUIRED');
      const reader = repo.getAuthorizedObservationPage?.bind(repo);
      const context = {...await buildNarrativeMemoryContext({ownerId:owner,receipt,save,...(reader ? {readAuthorizedPage:reader} : {})}),
        ...buildP1NarrativeHints(receipt,save)};
      const deadline = AbortSignal.any([signal,AbortSignal.timeout(120_000)]);
      const text = await currentAction.run(intent,() => render(receipt,deadline,context,true));
      return {text,revision:receipt.resultingRevision};
    },
  });
}
