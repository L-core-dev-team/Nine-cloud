import {
  ActionIntentSchema,
  PrologueV1FactsSchema,
  type ActionIntent,
  type Decision,
  type SaveEnvelope,
} from '@jiuxiao/contracts';
import { parseActionText, type ActionTemplate, type VisibleTarget, type VisibleTargetCatalog } from '@jiuxiao/domain/nlu';

type Rulebook = {
  readonly locationIds: readonly string[];
  readonly sublocations: readonly { readonly id: string; readonly locationId: string }[];
  readonly npcPresenceIds: readonly string[];
  readonly npcs: readonly { readonly npcId: string; readonly locationId: string; readonly topics: readonly unknown[] }[];
  readonly observations: readonly {
    readonly targetId: string;
    readonly locationId: string;
    readonly sublocationIds?: readonly string[];
  }[];
  readonly combatTargets: readonly {
    readonly targetId: string;
    readonly locationId: string;
    readonly accessibleFromSublocationIds?: readonly string[];
  }[];
  readonly itemUses: readonly { readonly itemId: string; readonly targetIds: readonly string[] }[];
};

type ContentEntry = { readonly id: string; readonly kind: string; readonly content: Readonly<Record<string, unknown>> };
type ContentPack = { readonly entries: readonly ContentEntry[] };

export interface P1ActionSuggestion {
  readonly id: string;
  readonly kind: 'move' | 'observe' | 'talk' | 'use_item' | 'combat';
  readonly label: string;
  /** A deterministic text template inserted into an editable input field. */
  readonly text: string;
}

export interface P1NluRuntime {
  readonly resolveFreeText: (
    intent: Extract<ActionIntent, { kind: 'free_text' }>,
    save: SaveEnvelope,
    decide: (intent: ActionIntent, save: SaveEnvelope) => Decision,
  ) => Decision;
  readonly actionSuggestions: (save: SaveEnvelope) => readonly P1ActionSuggestion[];
}

export interface P1NluDependencies {
  readonly rulebook: Rulebook;
  readonly contentPack: ContentPack;
  readonly templates: readonly ActionTemplate[];
}

/**
 * Loads the already approved lexical templates only after the review-only
 * candidate plugin has passed its independent approval and source-hash gate.
 * Production never calls this loader while AUTHOR_RULES_GATE is closed.
 */
export async function loadP1NluRuntime(): Promise<P1NluRuntime> {
  const contentRoot = new URL('../../../../packages/content/dist/', import.meta.url);
  const [fixtureExports, bookExports, contentExports] = await Promise.all([
    import('@jiuxiao/domain/nlu/prologue-v1-fixtures') as Promise<{
      PROLOGUE_V1_ACTION_TEMPLATES: readonly ActionTemplate[];
    }>,
    import(new URL('prologue/prologue-v1.rulebook-candidate.js', contentRoot).href) as Promise<{
      PROLOGUE_V1_RULEBOOK_CANDIDATE: Rulebook;
    }>,
    import(new URL('prologue/prologue-v1.js', contentRoot).href) as Promise<{
      PROLOGUE_V1_CONTENT_PACK: ContentPack;
    }>,
  ]);
  return createP1NluRuntime({
    rulebook: bookExports.PROLOGUE_V1_RULEBOOK_CANDIDATE,
    contentPack: contentExports.PROLOGUE_V1_CONTENT_PACK,
    templates: fixtureExports.PROLOGUE_V1_ACTION_TEMPLATES,
  });
}

/** Pure adapter shared by the approved parser and state-derived action suggestions. */
export function createP1NluRuntime(dependencies: P1NluDependencies): P1NluRuntime {
  const entries = new Map(dependencies.contentPack.entries.map(entry => [entry.id, entry]));
  const gameplayFactsFor = (save: SaveEnvelope) => {
    // Game creation keeps its idempotency fingerprint beside the facts in the
    // persisted envelope. It is storage metadata, not a P1 projection field.
    const { creationRequestHash: _creationRequestHash, ...gameplayFacts } = save.state.facts;
    return gameplayFacts;
  };
  const labelFor = (id: string): string | undefined => {
    const entry = entries.get(id);
    const name = entry?.content.name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    // The author-provided P1-MAP explicitly names this observation target “舟具”.
    if (id === 'obj_ferry_gear') return '舟具';
    const observationLabel = entry?.content.observationLabel;
    if (typeof observationLabel === 'string' && observationLabel.trim()) {
      return observationLabel.trim().split('·').at(-1)?.trim();
    }
    return undefined;
  };

  const visibleFor = (save: SaveEnvelope): VisibleTargetCatalog => {
    const facts = PrologueV1FactsSchema.parse(gameplayFactsFor(save));
    const visible = (id: string): VisibleTarget | undefined => {
      const label = labelFor(id);
      return label ? { id, label } : undefined;
    };
    const locations = new Set(dependencies.rulebook.locationIds);
    const presences = new Set(dependencies.rulebook.npcPresenceIds);
    const knownLocations = facts.knownLocations
      .filter(id => locations.has(id))
      .map(visible)
      .filter((entry): entry is VisibleTarget => entry !== undefined);
    const npcPresence = dependencies.rulebook.npcs
      .filter(npc => presences.has(npc.npcId) && facts.npcPresence.includes(npc.npcId) &&
        npc.locationId === save.state.locationId && npc.topics.length > 0)
      .map(npc => visible(npc.npcId))
      .filter((entry): entry is VisibleTarget => entry !== undefined);
    const currentSublocation = facts.currentSublocationId;
    const observationTargets = dependencies.rulebook.observations
      .filter(target => target.locationId === save.state.locationId &&
        (!target.sublocationIds || (currentSublocation !== null && target.sublocationIds.includes(currentSublocation))))
      .map(target => visible(target.targetId))
      .filter((entry): entry is VisibleTarget => entry !== undefined);
    const clues = facts.clues
      .map(visible)
      .filter((entry): entry is VisibleTarget => entry !== undefined);
    const inventory = facts.inventory
      .filter(item => item.quantity > 0)
      .map(item => visible(item.itemId))
      .filter((entry): entry is VisibleTarget => entry !== undefined);
    return { knownLocations, npcPresence, observationTargets, clues, inventory };
  };

  const suggestions = (save: SaveEnvelope): readonly P1ActionSuggestion[] => {
    let visible: VisibleTargetCatalog;
    try { visible = visibleFor(save); } catch { return []; }
    const rows: P1ActionSuggestion[] = [];
    for (const target of visible.knownLocations) {
      if (target.id !== save.state.locationId) rows.push({ id: `move:${target.id}`, kind: 'move', label: `前往${target.label}`, text: `去${target.label}` });
    }
    const facts = PrologueV1FactsSchema.safeParse(gameplayFactsFor(save));
    if (facts.success) {
      for (const target of dependencies.rulebook.sublocations.filter(row => row.locationId === save.state.locationId && row.id !== facts.data.currentSublocationId)) {
        const targetLabel = labelFor(target.id);
        if (targetLabel) rows.push({ id: `move:${target.id}`, kind: 'move', label: `前往${targetLabel}`, text: `去${targetLabel}` });
      }
    }
    for (const target of visible.observationTargets) {
      rows.push({ id: `observe:${target.id}:scan`, kind: 'observe', label: `观察${target.label}`, text: `观察${target.label}` });
      rows.push({ id: `observe:${target.id}:study`, kind: 'observe', label: `细察${target.label}`, text: `细察${target.label}` });
    }
    for (const target of visible.npcPresence) {
      rows.push({ id: `talk:${target.id}`, kind: 'talk', label: `与${target.label}交谈`, text: `对${target.label}说：` });
    }
    if (facts.success) {
      for (const item of visible.inventory) {
        const rule = dependencies.rulebook.itemUses.find(row => row.itemId === item.id);
        const targetId = rule?.targetIds.find(id => id === facts.data.currentSublocationId &&
          dependencies.rulebook.sublocations.some(target => target.id === id && target.locationId === save.state.locationId));
        const targetLabel = targetId ? labelFor(targetId) : undefined;
        if (targetId && targetLabel) rows.push({ id: `use_item:${item.id}:${targetId}`, kind: 'use_item', label: `使用${item.label}（${targetLabel}）`, text: `使用${item.label}在${targetLabel}` });
      }
    }
    if (facts.success && facts.data.obstacleState === 'blocked' && facts.data.clues.includes('clue_crow_nest')) {
      for (const target of dependencies.rulebook.combatTargets) {
        const targetLabel = labelFor(target.targetId);
        const hasAccess = !target.accessibleFromSublocationIds ||
          (facts.data.currentSublocationId !== null && target.accessibleFromSublocationIds.includes(facts.data.currentSublocationId));
        if (targetLabel && target.locationId === save.state.locationId && facts.data.npcPresence.includes(target.targetId) && hasAccess) {
          rows.push({ id: `combat:${target.targetId}`, kind: 'combat', label: `赶走${targetLabel}`, text: `赶走${targetLabel}` });
        }
      }
    }
    return rows.slice(0, 32);
  };

  return {
    resolveFreeText(intent, save, decide) {
      let visible: VisibleTargetCatalog;
      try { visible = visibleFor(save); } catch { return decide(intent, save); }
      const facts = PrologueV1FactsSchema.safeParse(gameplayFactsFor(save));
      if (facts.success) {
        const phrase = normalizeActionText(intent.payload.text);
        const sublocationMoves = dependencies.rulebook.sublocations.filter(target => {
          const label = labelFor(target.id);
          return !!label && target.locationId === save.state.locationId && phrase === `去${label}`;
        });
        if (sublocationMoves.length === 1) {
          const moveIntent = ActionIntentSchema.safeParse({
            saveId: intent.saveId, actorId: intent.actorId, branchId: intent.branchId,
            expectedRevision: intent.expectedRevision, idempotencyKey: intent.idempotencyKey,
            ...(intent.clarificationOf ? { clarificationOf: intent.clarificationOf } : {}),
            kind: 'move', payload: { destinationId: sublocationMoves[0]!.id },
          });
          if (moveIntent.success) return decide(moveIntent.data, save);
        }
        const validItemUses = dependencies.rulebook.itemUses.flatMap(rule => rule.targetIds.map(targetId => ({ itemId: rule.itemId, targetId })))
          .filter(row => row.targetId === facts.data.currentSublocationId &&
            dependencies.rulebook.sublocations.some(target => target.id === row.targetId && target.locationId === save.state.locationId) &&
            facts.data.inventory.some(item => item.itemId === row.itemId && item.quantity > 0));
        const useMatches = validItemUses.filter(row => {
          const itemLabel = labelFor(row.itemId);
          const targetLabel = labelFor(row.targetId);
          return !!itemLabel && !!targetLabel && phrase === `使用${itemLabel}在${targetLabel}`;
        });
        if (useMatches.length === 1) {
          const useIntent = ActionIntentSchema.safeParse({
            saveId: intent.saveId, actorId: intent.actorId, branchId: intent.branchId,
            expectedRevision: intent.expectedRevision, idempotencyKey: intent.idempotencyKey,
            ...(intent.clarificationOf ? { clarificationOf: intent.clarificationOf } : {}),
            kind: 'use_item', payload: { itemId: useMatches[0]!.itemId, targetId: useMatches[0]!.targetId },
          });
          if (useIntent.success) return decide(useIntent.data, save);
        }
        const combatMatches = dependencies.rulebook.combatTargets.filter(target => {
          const label = labelFor(target.targetId);
          return !!label && target.locationId === save.state.locationId && facts.data.npcPresence.includes(target.targetId) &&
            (phrase === `赶走${label}` || phrase === `驱退${label}`);
        });
        if (combatMatches.length === 1) {
          const combatIntent = ActionIntentSchema.safeParse({
            saveId: intent.saveId,
            actorId: intent.actorId,
            branchId: intent.branchId,
            expectedRevision: intent.expectedRevision,
            idempotencyKey: intent.idempotencyKey,
            ...(intent.clarificationOf ? { clarificationOf: intent.clarificationOf } : {}),
            kind: 'combat',
            payload: { targetId: combatMatches[0]!.targetId },
          });
          if (combatIntent.success) return decide(combatIntent.data, save);
        }
      }
      const parsed = parseActionText({
        text: intent.payload.text,
        identity: {
          saveId: intent.saveId,
          actorId: intent.actorId,
          branchId: intent.branchId,
          expectedRevision: intent.expectedRevision,
          idempotencyKey: intent.idempotencyKey,
          ...(intent.clarificationOf ? { clarificationOf: intent.clarificationOf } : {}),
        },
        visible,
        visibilityRevision: save.revision,
        templates: dependencies.templates,
      });
      return parsed.status === 'ready' ? decide(parsed.intent, save) : parsed.decision;
    },
    actionSuggestions: suggestions,
  };
}

function normalizeActionText(value: string): string {
  return value.normalize('NFKC').trim().replace(/[。！!？?，,；;]+$/u, '').trim();
}
