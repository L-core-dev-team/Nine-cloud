import { IndexedGameCache, cacheIdentity, beginGameAction, editGameDraft, finishGameAction, type GameCache, type GameCacheScope, type PendingGameAction, type ReadingPosition } from './cloud-game-cache';
import { gameCacheScope } from './use-cloud-game-session';

/** Presentation-only bridge: the durable P3 cache never reconstructs rules or memory. */
export class CloudGameCacheBridge {
  private readonly store = new IndexedGameCache();
  private writes: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private value!: GameCache;
  readonly scope: GameCacheScope;
  recoveryDraft: string | undefined;
  private journalKey() { return `jiuxiao_cloud_draft_journal_v1:${cacheIdentity(this.scope).key}`; }
  discardJournal() { sessionStorage.removeItem(this.journalKey()); }
  private clearJournal(id:string) {
    const raw=sessionStorage.getItem(this.journalKey());
    if(raw&&JSON.parse(raw).id===id)this.discardJournal();
  }
  constructor(ownerId: string, saveId: string) { this.scope=gameCacheScope(ownerId,saveId); }
  async open() {
    this.value=await this.store.read(this.scope);
    const raw=sessionStorage.getItem(this.journalKey());
    if(raw) {
      const journal=JSON.parse(raw) as {id:string;epoch:number;baseVersion:number;text:string};
      if(typeof journal.id!=='string'||typeof journal.text!=='string'||journal.text.length>8000||!Number.isSafeInteger(journal.baseVersion)||journal.baseVersion<0)throw Error('GAME_DRAFT_JOURNAL_INVALID');
      if(journal.epoch!==this.value.epoch||journal.text===this.value.draft)this.clearJournal(journal.id);
      else if(journal.baseVersion===this.value.draftVersion&&!this.value.pending) {
        this.value=await this.store.change(this.scope,this.value.epoch,current=>editGameDraft(current,journal.text,journal.baseVersion));
        this.clearJournal(journal.id);
      } else {
        // Preserve both drafts; a tab-local journal never overwrites a newer tab's CAS result.
        this.recoveryDraft=journal.text;this.failure=Error('GAME_DRAFT_CONFLICT');
      }
    }
    return this.value;
  }
  snapshot() { return this.value; }
  edit(text:string) {
    // Synchronous, tab-local journal covers navigation before the IDB transaction commits.
    const journal={id:crypto.randomUUID(),epoch:this.value.epoch,baseVersion:this.value.draftVersion,text};
    try { sessionStorage.setItem(this.journalKey(),JSON.stringify(journal)); }
    catch(error) { this.failure=error;return Promise.reject(error); }
    this.writes=this.writes.then(async()=>{
      if(this.failure)throw this.failure;
      this.value=await this.store.change(this.scope,this.value.epoch,current=>editGameDraft(current,text,this.value.draftVersion));
      this.clearJournal(journal.id);
    }).catch(error=>{this.failure=error;});
    return this.writes;
  }
  async ready() { await this.writes;if(this.failure)throw this.failure; }
  async prepare(request:Omit<PendingGameAction,'draftVersion'|'requestNarrative'|'delivery'>) {
    await this.ready();
    this.value=await this.store.change(this.scope,this.value.epoch,current=>{
      if(current.pending) {
        const prior=current.pending;
        if(prior.idempotencyKey!==request.idempotencyKey||prior.text!==request.text||prior.expectedRevision!==request.expectedRevision||JSON.stringify(prior.action)!==JSON.stringify(request.action))throw new Error('GAME_ACTION_CHANGED');
        return {...current,pending:{...prior,delivery:'sent'}};
      }
      if(current.draftVersion!==this.value.draftVersion)throw new Error('GAME_DRAFT_CONFLICT');
      return beginGameAction(current,{...request,draftVersion:current.draftVersion,requestNarrative:true,delivery:'sent'});
    });
  }
  async abandonBeforeSettlement(key:string) {
    await this.ready();
    this.value=await this.store.change(this.scope,this.value.epoch,current=>{
      if(current.pending?.idempotencyKey!==key)throw new Error('GAME_ACTION_CHANGED');
      return {...current,pending:null};
    });
  }
  async finish(key:string,receipt:unknown,text:string) {
    await this.ready();
    this.value=await this.store.change(this.scope,this.value.epoch,current=>finishGameAction(current,this.scope,key,receipt,text));
    return this.value;
  }
  async remember(position:ReadingPosition) {
    await this.ready();
    this.value=await this.store.change(this.scope,this.value.epoch,current=>({...current,position}));
  }
}
