import { PrologueV1FactsSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import type { NarrativeContext } from './narrative-scheduler.js';

export const P1_NARRATIVE_HINT_TEXT = Object.freeze({
  lowStamina: '手在抖',
  cenjiuShoulderQuestion: '肩上怎么了',
  cenjiuThirdIdleHook: '你要是走南边那条路，替我看一眼。什么也没有最好。',
});

/** Builds only source-backed narration hints from committed P1 state and receipt. */
export function buildP1NarrativeHints(receipt: TurnReceipt, save?: SaveEnvelope): Pick<NarrativeContext, 'playerConditionLines' | 'npcUtterances'> {
  if (receipt.decision.status !== 'accepted') {
    return { playerConditionLines: [], npcUtterances: [] };
  }
  const npcUtterances: { npcId: string; line: string }[] = [];
  const directTalks = receipt.decision.events.filter(event => event.type === 'talk.occurred');
  for (const event of directTalks) {
    if (event.type !== 'talk.occurred' || event.payload.npcId !== 'npc_cenjiu') continue;
    if (event.payload.outcome === 'idle' && thirdConsecutiveIdleTransition(event.payload.stateDelta)) {
      npcUtterances.push({ npcId: 'npc_cenjiu', line: P1_NARRATIVE_HINT_TEXT.cenjiuThirdIdleHook });
    }
  }

  // State-derived presentation must describe the same revision as this receipt.
  // A duplicate request can arrive after later turns; the current save must not
  // make a past interaction appear to have contained a later injury or fatigue.
  let playerConditionLines: string[] = [];
  if (save?.schemaVersion === 2 && save.revision === receipt.resultingRevision) {
    const { creationRequestHash: _creationRequestHash, ...gameplayFacts } = save.state.facts;
    const parsed = PrologueV1FactsSchema.safeParse(gameplayFacts);
    if (parsed.success) {
      playerConditionLines = parsed.data.stamina < 20 ? [P1_NARRATIVE_HINT_TEXT.lowStamina] : [];
      if (parsed.data.injuryFlags.includes('shoulder_scrape') && directTalks.some(event =>
        event.type === 'talk.occurred' && event.payload.npcId === 'npc_cenjiu')) {
        npcUtterances.push({ npcId: 'npc_cenjiu', line: P1_NARRATIVE_HINT_TEXT.cenjiuShoulderQuestion });
      }
    }
  }
  return { playerConditionLines, npcUtterances: uniqueUtterances(npcUtterances) };
}

export function ensureP1NarrativeHints(text: string, receipt: TurnReceipt, context: NarrativeContext): string {
  const lines = [...(context.playerConditionLines ?? [])];
  const speakers = new Set(receipt.decision.status === 'accepted'
    ? receipt.decision.events.filter(event => event.type === 'talk.occurred').map(event => event.payload.npcId)
    : []);
  for (const utterance of context.npcUtterances ?? []) {
    if (speakers.has(utterance.npcId)) lines.push(utterance.line);
  }
  let result = text.trimEnd();
  for (const line of [...new Set(lines)]) {
    if (result.includes(line)) continue;
    result += `${result ? '\n' : ''}${line}`;
  }
  return result;
}

function thirdConsecutiveIdleTransition(rawDelta: unknown): boolean {
  if (!rawDelta || typeof rawDelta !== 'object' || !('factChanges' in rawDelta) || !Array.isArray(rawDelta.factChanges)) return false;
  const change = rawDelta.factChanges.find((entry): entry is { key: string; before: unknown; after: unknown } =>
    !!entry && typeof entry === 'object' && 'key' in entry && entry.key === 'idleCount' && 'before' in entry && 'after' in entry);
  if (!change || !change.before || typeof change.before !== 'object' || !('present' in change.before) || change.before.present !== true ||
      !('value' in change.before) || !change.after || typeof change.after !== 'object' || !('present' in change.after) || change.after.present !== true ||
      !('value' in change.after)) return false;
  return change.before.value === 2 && change.after.value === 3;
}

function uniqueUtterances(rows: readonly { npcId: string; line: string }[]): { npcId: string; line: string }[] {
  return [...new Map(rows.map(row => [`${row.npcId}\0${row.line}`, row])).values()];
}
