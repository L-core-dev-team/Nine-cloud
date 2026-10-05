import {
  ActionIntentSchema,
  CLARIFICATION_ACTION_ORDER,
  DecisionV2Schema,
  type ActionIntent,
  type DecisionV2,
} from '@jiuxiao/contracts';

export type VisibleTargetSource = 'knownLocations' | 'npcPresence' | 'observationTargets' | 'clues' | 'inventory';

export interface VisibleTarget {
  readonly id: string;
  readonly label: string;
  readonly aliases?: readonly string[];
  /** Required only when two visible targets share the same displayed label. */
  readonly disambiguator?: string;
}

/** These arrays must be assembled from the caller's current, authorized view. */
export interface VisibleTargetCatalog {
  readonly knownLocations: readonly VisibleTarget[];
  readonly npcPresence: readonly VisibleTarget[];
  /** Rule-owned observation targets filtered to the player's current visible scene. */
  readonly observationTargets: readonly VisibleTarget[];
  readonly clues: readonly VisibleTarget[];
  readonly inventory: readonly VisibleTarget[];
}

export interface ActionIntentIdentity {
  readonly saveId: string;
  readonly actorId: string;
  readonly branchId: 'root';
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly clarificationOf?: string;
}

type EntitySlotForKind = {
  move: { source: 'knownLocations'; slot: 'destinationId' };
  use_item: { source: 'inventory'; slot: 'itemId' };
  talk: { source: 'npcPresence'; slot: 'npcId' };
  observe: { source: 'observationTargets'; slot: 'targetId' };
};

export type BoundActionKind = keyof EntitySlotForKind;

type ActionTemplateBase = {
  readonly id: string;
  readonly prefix: string;
  readonly suffix?: string;
  readonly fixedPayload?: Readonly<Record<string, unknown>>;
  readonly labelPrefix?: string;
  readonly labelSuffix?: string;
};

export type ActionTemplate =
  | (ActionTemplateBase & { readonly kind: 'move'; readonly entitySource: 'knownLocations'; readonly capture?: never })
  | (ActionTemplateBase & { readonly kind: 'use_item'; readonly entitySource: 'inventory'; readonly capture?: never })
  | (ActionTemplateBase & { readonly kind: 'talk'; readonly entitySource: 'npcPresence'; readonly capture: { readonly separator: string; readonly slot: 'utterance' } })
  | (ActionTemplateBase & { readonly kind: 'observe'; readonly entitySource: 'observationTargets'; readonly capture?: never });

export type ActionParseResult =
  | { readonly status: 'ready'; readonly intent: ActionIntent }
  | {
    readonly status: 'clarify';
    readonly classification: 'missing' | 'ambiguous' | 'unknown';
    /** Persistable structured decision. This value never contains a raw player utterance. */
    readonly decision: Extract<DecisionV2, { status: 'clarify' }>;
    /** Ephemeral presentation only. Callers must not store this beside the receipt. */
    readonly presentationQuestion: string;
  };

interface CandidateMatch {
  readonly template: ActionTemplate;
  readonly target: VisibleTarget;
  readonly targetAlias: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly label: string;
}

const ENTITY_SLOT_POLICY: Readonly<Record<BoundActionKind, Readonly<Record<VisibleTargetSource, string | undefined>>>> = {
  move: { knownLocations: 'destinationId', npcPresence: undefined, observationTargets: undefined, clues: undefined, inventory: undefined },
  use_item: { knownLocations: undefined, npcPresence: undefined, observationTargets: undefined, clues: undefined, inventory: 'itemId' },
  talk: { knownLocations: undefined, npcPresence: 'npcId', observationTargets: undefined, clues: undefined, inventory: undefined },
  observe: { knownLocations: undefined, npcPresence: undefined, observationTargets: 'targetId', clues: undefined, inventory: undefined },
};

const ACTION_ORDER = new Map(CLARIFICATION_ACTION_ORDER.map((kind, index) => [kind, index]));
const NEGATION_OR_CONDITION = /(?:不要|別|别|不去|不想|不應|不应|不能|没|未|如果|假如|要是|除非|等到|等.+再)/u;
const UNRESOLVED_REFERENCE = /(?:那边|那兒|那儿|这里|這裡|那里|那裡|这个|這個|那个|那個|它|他|她|刚才|剛才|之前|上次)/u;
const MAX_UNKNOWN_ECHO_CODEPOINTS = 160;

/**
 * A deterministic parser kernel. It has no model, clock, RNG, persistence, or
 * hidden-world access. The caller supplies only the current visible targets.
 */
export function parseActionText(input: {
  readonly text: string;
  readonly identity: ActionIntentIdentity;
  readonly visible: VisibleTargetCatalog;
  readonly visibilityRevision: number;
  readonly templates: readonly ActionTemplate[];
}): ActionParseResult {
  if (typeof input.text !== 'string') throw new TypeError('P1_NLU_TEXT_INVALID');
  validateTemplates(input.templates);
  validateVisibleCatalog(input.visible);

  if (input.text.length > 4000) {
    return clarify('unknown', input.identity, '这句话太长，请缩短后再试。', [], []);
  }
  const text = normalize(input.text);
  if (input.visibilityRevision !== input.identity.expectedRevision) {
    return clarify('unknown', input.identity, '刚才看到的行动信息已过时。请刷新后重新选择。', [], []);
  }
  if (input.identity.clarificationOf === input.identity.idempotencyKey) {
    return clarify('unknown', input.identity, '这次修改需要新的提交编号，请重新提交。', [], []);
  }
  if (!text) {
    return clarify('missing', input.identity, '你想做什么？', ['action'], []);
  }
  const matches: CandidateMatch[] = [];
  const missingSlots: string[] = [];
  for (const template of input.templates) {
    const parsed = matchTemplate(text, template, input.visible);
    if (parsed.kind === 'match') matches.push(...parsed.matches);
    if (parsed.kind === 'missing') missingSlots.push(...parsed.slots);
  }

  // A direct quote addressed to an NPC is speech content, not an instruction
  // to the game. Negation inside that quote must not suppress the talk action.
  const containsSpeech = matches.some(match => match.template.kind === 'talk');
  if (!containsSpeech && (NEGATION_OR_CONDITION.test(text) || UNRESOLVED_REFERENCE.test(text))) {
    const question = unknownQuestion(input.text, true);
    return clarify('unknown', input.identity, question.receiptQuestion, [], [], question.presentationQuestion);
  }

  const canonicalMatches = dedupeAndSort(matches);
  if (canonicalMatches.length === 1) {
    const match = canonicalMatches[0]!;
    const parsed = ActionIntentSchema.safeParse({
      ...input.identity,
      kind: match.template.kind,
      payload: match.payload,
    });
    if (parsed.success) return { status: 'ready', intent: parsed.data };
    const question = unknownQuestion(input.text, false);
    return clarify('unknown', input.identity, question.receiptQuestion, [], [], question.presentationQuestion);
  }

  if (canonicalMatches.length > 1) {
    const candidates = toCandidates(canonicalMatches);
    if (candidates.length > 4 || candidates.some(candidate => candidate.label.length > 160) ||
        new Set(candidates.map(candidate => candidate.label)).size !== candidates.length) {
      return clarify('ambiguous', input.identity, '这句话对应多个可见目标，请补充地点或对象特征。', [], []);
    }
    return clarify('ambiguous', input.identity, '你想做下面哪一项？', [], candidates);
  }

  const uniqueMissingSlots = [...new Set(missingSlots)];
  if (uniqueMissingSlots.length > 0) {
    if (uniqueMissingSlots.length > 8) {
      const question = unknownQuestion(input.text, false);
      return clarify('unknown', input.identity, question.receiptQuestion, [], [], question.presentationQuestion);
    }
    return clarify('missing', input.identity, questionForMissing(uniqueMissingSlots[0]!), uniqueMissingSlots, []);
  }
  const question = unknownQuestion(input.text, false);
  return clarify('unknown', input.identity, question.receiptQuestion, [], [], question.presentationQuestion);
}

function matchTemplate(text: string, template: ActionTemplate, visible: VisibleTargetCatalog):
  | { readonly kind: 'match'; readonly matches: readonly CandidateMatch[] }
  | { readonly kind: 'missing'; readonly slots: readonly string[] }
  | { readonly kind: 'none' } {
  const prefix = normalize(template.prefix);
  const suffix = normalize(template.suffix ?? '');
  if (!text.startsWith(prefix)) return { kind: 'none' };
  const afterPrefix = text.slice(prefix.length);
  const allowedSlot = ENTITY_SLOT_POLICY[template.kind][template.entitySource];
  if (!allowedSlot) return { kind: 'none' };

  const targets = visible[template.entitySource];
  const matches: CandidateMatch[] = [];
  for (const target of targets) {
    const aliases = [target.label, ...(target.aliases ?? [])].map(normalize).filter(Boolean);
    for (const alias of new Set(aliases)) {
      if (template.capture) {
        const separator = normalize(template.capture.separator);
        const lead = `${alias}${separator}`;
        if (!afterPrefix.startsWith(lead)) continue;
        const utterance = afterPrefix.slice(lead.length).trim();
        if (!utterance) return { kind: 'missing', slots: ['utterance'] };
        const fixed = template.fixedPayload ?? {};
        const payload = { ...fixed, [allowedSlot]: target.id, utterance };
        matches.push({ template, target, targetAlias: alias, payload,
          label: `${template.labelPrefix ?? '与'}${targetLabel(target)}${template.labelSuffix ?? '交谈'}` });
        continue;
      }

      if (!afterPrefix.endsWith(suffix)) continue;
      const targetText = suffix ? afterPrefix.slice(0, -suffix.length) : afterPrefix;
      if (normalize(targetText) !== alias) continue;
      const payload = { ...(template.fixedPayload ?? {}), [allowedSlot]: target.id };
      matches.push({ template, target, targetAlias: alias, payload, label: `${template.labelPrefix ?? template.prefix}${targetLabel(target)}${template.labelSuffix ?? template.suffix ?? ''}` });
    }
  }
  if (matches.length > 0) return { kind: 'match', matches };

  if (!afterPrefix || (template.capture && afterPrefix === normalize(template.suffix ?? ''))) {
    return { kind: 'missing', slots: [template.capture && afterPrefix ? 'utterance' : allowedSlot] };
  }
  if (template.capture && afterPrefix === normalize(template.capture.separator)) {
    return { kind: 'missing', slots: [allowedSlot] };
  }
  if (!template.capture && suffix && afterPrefix === suffix) return { kind: 'missing', slots: [allowedSlot] };
  return { kind: 'none' };
}

function dedupeAndSort(matches: readonly CandidateMatch[]): CandidateMatch[] {
  const unique = new Map<string, CandidateMatch>();
  for (const match of matches) {
    const key = `${match.template.kind}\0${stableJson(match.payload)}`;
    const existing = unique.get(key);
    if (!existing || match.label < existing.label || (match.label === existing.label && match.template.id < existing.template.id)) {
      unique.set(key, match);
    }
  }
  return [...unique.values()].sort((left, right) => {
    const kindOrder = ACTION_ORDER.get(left.template.kind)! - ACTION_ORDER.get(right.template.kind)!;
    if (kindOrder !== 0) return kindOrder;
    if (left.target.id !== right.target.id) return left.target.id < right.target.id ? -1 : 1;
    if (left.template.id !== right.template.id) return left.template.id < right.template.id ? -1 : 1;
    const leftPayload = stableJson(left.payload);
    const rightPayload = stableJson(right.payload);
    return leftPayload < rightPayload ? -1 : leftPayload > rightPayload ? 1 : 0;
  });
}

function toCandidates(matches: readonly CandidateMatch[]) {
  return matches.map(match => ({
    kind: match.template.kind,
    label: match.label,
    slots: match.template.kind === 'talk'
      ? Object.fromEntries(Object.entries(match.payload).filter(([key]) => key !== 'utterance'))
      : match.payload,
  }));
}

function clarify(
  classification: 'missing' | 'ambiguous' | 'unknown',
  identity: ActionIntentIdentity,
  question: string,
  missingSlots: readonly string[],
  candidates: readonly { kind: BoundActionKind; label: string; slots: Readonly<Record<string, unknown>> }[],
  presentationQuestion = question,
): ActionParseResult {
  const parsedDecision = DecisionV2Schema.parse({
    status: 'clarify',
    question,
    missingSlots: [...missingSlots],
    candidates: [...candidates],
    interactionId: identity.idempotencyKey,
    ...(identity.clarificationOf ? { clarificationOf: identity.clarificationOf } : {}),
    revision: identity.expectedRevision,
  });
  if (parsedDecision.status !== 'clarify') throw new TypeError('P1_NLU_CLARIFICATION_INVALID');
  return { status: 'clarify', classification, decision: parsedDecision, presentationQuestion };
}

function validateTemplates(templates: readonly ActionTemplate[]): void {
  if (!Array.isArray(templates)) throw new TypeError('P1_NLU_TEMPLATES_INVALID');
  const ids = new Set<string>();
  for (const template of templates as readonly ActionTemplate[]) {
    const slot = ENTITY_SLOT_POLICY[template.kind]?.[template.entitySource];
    if (!template.id || template.id.length > 80 || ids.has(template.id) || !slot || !normalize(template.prefix) ||
        template.prefix.length > 80 || (template.suffix?.length ?? 0) > 80 ||
        NEGATION_OR_CONDITION.test(template.prefix) || UNRESOLVED_REFERENCE.test(template.prefix) ||
        (template.kind === 'talk' ? !template.capture || !normalize(template.capture.separator) : template.capture !== undefined)) {
      throw new TypeError('P1_NLU_TEMPLATE_INVALID');
    }
    const probePayload = { ...(template.fixedPayload ?? {}), [slot]: '__visible_target__', ...(template.capture ? { utterance: '__spoken_text__' } : {}) };
    if (!ActionIntentSchema.safeParse({
      saveId: 'fixture-save', actorId: 'fixture-player', branchId: 'root', expectedRevision: 0,
      idempotencyKey: '11111111-1111-4111-8111-111111111111', kind: template.kind, payload: probePayload,
    }).success) throw new TypeError('P1_NLU_TEMPLATE_INVALID');
    ids.add(template.id);
  }
}

function validateVisibleCatalog(catalog: VisibleTargetCatalog): void {
  for (const source of ['knownLocations', 'npcPresence', 'observationTargets', 'clues', 'inventory'] as const) {
    if (!Array.isArray(catalog[source])) throw new TypeError('P1_NLU_CATALOG_INVALID');
    const ids = new Set<string>();
    for (const target of catalog[source]) {
      if (!target.id || !target.label || target.label.length > 240 || ids.has(target.id) ||
          (target.disambiguator !== undefined && target.disambiguator.length > 80)) throw new TypeError('P1_NLU_CATALOG_INVALID');
      ids.add(target.id);
      for (const alias of target.aliases ?? []) {
        if (!normalize(alias) || alias.length > 240) throw new TypeError('P1_NLU_CATALOG_INVALID');
      }
    }
  }
}

function targetLabel(target: VisibleTarget): string {
  return target.disambiguator ? `${target.label}（${target.disambiguator}）` : target.label;
}

function questionForMissing(slot: string): string {
  const questions: Readonly<Record<string, string>> = {
    action: '你想做什么？',
    destinationId: '你想去哪里？',
    itemId: '你想用哪件物品？',
    npcId: '你想和谁说话？',
    targetId: '你想观察什么？',
    utterance: '你想对这个人说什么？',
  };
  return questions[slot] ?? `请补充${slot}。`;
}

function unknownQuestion(original: string, unresolved: boolean): { receiptQuestion: string; presentationQuestion: string } {
  const reason = unresolved ? '这句话包含尚未解析的否定、条件或指代' : '我还不能确定这句话对应哪项行动';
  const nextStep = '请换一种说法，或先补充明确地点、人物或对象。';
  const echo = Array.from(original.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim())
    .slice(0, MAX_UNKNOWN_ECHO_CODEPOINTS).join('');
  return {
    receiptQuestion: `${reason}。${nextStep}`,
    presentationQuestion: `${reason}：「${echo}」。${nextStep}`,
  };
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').replace(/[。！!？?，,；;]+$/u, '').trim();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export type ParsedReadyIntent = Extract<ActionParseResult, { status: 'ready' }>['intent'];
export type ParsedClarification = Extract<ActionParseResult, { status: 'clarify' }>['decision'];
