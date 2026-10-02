import { TurnReceiptSchema, type TurnReceipt } from '@jiuxiao/contracts';

export const narrativeRoles = ['director', 'premiumDirector', 'story', 'stateManager', 'archive'] as const;
export type NarrativeRole = typeof narrativeRoles[number];
export type RoleOutput = { text: string; outputTokens: number };
export type RoleAdapter = (input: { role: NarrativeRole; receipt: TurnReceipt; candidates: Partial<Record<NarrativeRole, string>>; maxOutputTokens: number }, signal: AbortSignal) => Promise<RoleOutput>;
export type RoleSlot = { enabled: boolean; timeoutMs: number; maxOutputTokens: number; retries: number; primary: RoleAdapter; fallback?: RoleAdapter };
export type RoleTrace = { role: NarrativeRole; status: 'received' | 'failed' | 'skipped'; attempts: number; reservedOutputTokens: number; reportedOutputTokens: number; code?: 'ROLE_UNAVAILABLE' | 'BUDGET_EXHAUSTED' };
export type ScheduleResult = { text: string; trace: RoleTrace[]; reservedOutputTokens: number };

/** Host-supplied adapters only. Outputs are candidates/presentation, never rules or state mutations. */
export class NarrativeScheduler {
  constructor(private readonly slots: Partial<Record<NarrativeRole, RoleSlot>>, private readonly outputBudget: number) {
    if (!Number.isSafeInteger(outputBudget) || outputBudget < 1 || outputBudget > 1_000_000) throw new TypeError('Invalid output budget');
    for (const slot of Object.values(slots)) if (slot && (!Number.isInteger(slot.timeoutMs) || slot.timeoutMs < 1 || slot.timeoutMs > 120_000 || !Number.isInteger(slot.maxOutputTokens) || slot.maxOutputTokens < 1 || slot.maxOutputTokens > 100_000 || !Number.isInteger(slot.retries) || slot.retries < 0 || slot.retries > 2)) throw new TypeError('Invalid role bounds');
  }
  async run(rawReceipt: TurnReceipt, cancellation: AbortSignal): Promise<ScheduleResult> {
    const receipt = TurnReceiptSchema.parse(rawReceipt);
    if (receipt.decision.status !== 'accepted') throw new Error('TURN_NOT_COMMITTED');
    const candidates: Partial<Record<NarrativeRole, string>> = {}; const trace: RoleTrace[] = []; let reserved = 0;
    for (const role of narrativeRoles) {
      if (cancellation.aborted) throw new Error('NARRATIVE_CANCELLED');
      const slot = this.slots[role]; if (!slot?.enabled) { trace.push({ role, status: 'skipped', attempts: 0, reservedOutputTokens: 0, reportedOutputTokens: 0 }); continue; }
      const row: RoleTrace = { role, status: 'failed', attempts: 0, reservedOutputTokens: 0, reportedOutputTokens: 0, code: 'ROLE_UNAVAILABLE' };
      // Reserve each dispatched attempt, including failures: timed-out providers may still consume tokens.
      const adapters = [...Array.from({ length: slot.retries + 1 }, () => slot.primary), ...(slot.fallback ? [slot.fallback] : [])];
      for (const adapter of adapters) {
        if (cancellation.aborted) throw new Error('NARRATIVE_CANCELLED');
        if (reserved + slot.maxOutputTokens > this.outputBudget) { row.code = 'BUDGET_EXHAUSTED'; break; }
        reserved += slot.maxOutputTokens; row.reservedOutputTokens += slot.maxOutputTokens; row.attempts++;
        try {
          const result = await boundedCall(adapter, { role, receipt: structuredClone(receipt), candidates: structuredClone(candidates), maxOutputTokens: slot.maxOutputTokens }, slot.timeoutMs, cancellation);
          if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 100_000 || !Number.isInteger(result.outputTokens) || result.outputTokens < 0 || result.outputTokens > slot.maxOutputTokens) throw new Error('INVALID_ROLE_OUTPUT');
          candidates[role] = result.text; row.status = 'received'; row.reportedOutputTokens = result.outputTokens; delete row.code; break;
        } catch { if (cancellation.aborted) throw new Error('NARRATIVE_CANCELLED'); }
      }
      trace.push(row);
      // Never silently substitute a director's candidate for the required story role.
      if (role === 'story' && row.status !== 'received') throw new Error(row.code === 'BUDGET_EXHAUSTED' ? 'NARRATIVE_BUDGET_EXHAUSTED' : 'NARRATIVE_UNAVAILABLE');
    }
    if (!candidates.story) throw new Error('NARRATIVE_UNAVAILABLE');
    return { text: candidates.story, trace, reservedOutputTokens: reserved };
  }
  narrator() { return async (receipt: TurnReceipt, signal: AbortSignal) => (await this.run(receipt, signal)).text; }
}
async function boundedCall(adapter: RoleAdapter, input: Parameters<RoleAdapter>[0], timeoutMs: number, cancellation: AbortSignal): Promise<RoleOutput> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let abort!: () => void;
  const stop = new Promise<never>((_resolve, reject) => {
    abort = () => { controller.abort(); reject(new Error('NARRATIVE_CANCELLED')); };
    cancellation.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error('ROLE_TIMEOUT')); }, timeoutMs);
    if (cancellation.aborted) abort();
  });
  try { return await Promise.race([stop, Promise.resolve().then(() => { if (controller.signal.aborted) throw new Error('ROLE_CANCELLED'); return adapter(input, controller.signal); })]); }
  finally { clearTimeout(timer); cancellation.removeEventListener('abort', abort); controller.abort(); }
}
