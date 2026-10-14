import type { TurnReceipt } from '@jiuxiao/contracts';
import type { NarrativeContext } from './narrative-scheduler.js';
import { ensureP1NarrativeHints } from './p1-narrative-hints.js';
import { NarrativePublicationRepository, type Publication } from './narrative-publication-repository.js';

export type DeterministicRenderer = (receipt: TurnReceipt, context: NarrativeContext) => string | Promise<string>;
/** Internal worker only. No public retry endpoint, no model, no new action key or rule execution. */
export class NarrativeOutboxWorker {
  constructor(private readonly repository: NarrativePublicationRepository,
    private readonly renderers: ReadonlyMap<string, DeterministicRenderer>) {}
  async drain(limit=20) {
    const tasks=await this.repository.queued(limit);
    const outcomes:('published'|'pending'|'failed')[]=[];
    for(const task of tasks) {
      try {outcomes.push(await this.run(task.ownerId,task.saveId,task.requestKey)?'published':'pending');}
      catch {outcomes.push('failed');} // Safe status only: no body or private context in logs.
    }
    return outcomes;
  }
  async run(owner: string, save: string, key: string): Promise<Publication | null> {
    const prior = await this.repository.presentation(owner, save, key);
    if (!prior || prior.publication === 'legacy-body-unavailable') return null;
    if (prior.source) return prior.source;
    const lease = await this.repository.claim(owner, save, key);
    if (!lease) return (await this.repository.presentation(owner, save, key))?.source ?? null;
    try {
      const render = this.renderers.get(lease.context.rendererVersion);
      if (!render) throw Error('NARRATIVE_RENDERER_VERSION_UNAVAILABLE');
      const context: NarrativeContext = { npcMemories: [], ...lease.context.hints };
      const rendered = await render(structuredClone(lease.context.receipt), structuredClone(context));
      return await this.repository.publish(lease, ensureP1NarrativeHints(rendered, lease.context.receipt, context));
    } catch (error) { await this.repository.fail(lease); throw error; }
  }
}
