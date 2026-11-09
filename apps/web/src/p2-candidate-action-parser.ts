import { ActionIntentSchema, DecisionV2Schema, type ActionIntent } from '@jiuxiao/contracts';
import { parseActionText, type ActionParseResult, type ActionTemplate, type VisibleTarget, type VisibleTargetCatalog } from '@jiuxiao/domain/nlu';

export type P2CandidateVisibleCatalog = VisibleTargetCatalog & {
  sublocations?: readonly VisibleTarget[];
  returnLocations?: readonly VisibleTarget[];
  acquisitionTargets?: readonly VisibleTarget[];
  combatTargets?: readonly VisibleTarget[];
  questTargets?: readonly VisibleTarget[];
};

type CandidateEntitySource = 'sublocations' | 'returnLocations' | 'acquisitionTargets' | 'inventory' | 'combatTargets' | 'questTargets';
export type P2CandidateActionTemplate = {
  id: string;
  kind: 'move' | 'acquire_item' | 'use_item' | 'combat' | 'quest';
  prefix: string;
  suffix?: string;
  entitySource: CandidateEntitySource;
  fixedPayload?: Readonly<Record<string, unknown>>;
};

/**
 * Extends the signed P1 parser only inside the DEV review surface. P1 source
 * and its semantic review digest stay unchanged; all additional targets are
 * still drawn from the current candidate-visible catalog.
 */
export function parseP2CandidateActionText(input: {
  text: string;
  identity: Parameters<typeof parseActionText>[0]['identity'];
  visible: P2CandidateVisibleCatalog;
  visibilityRevision: number;
  p1Templates: readonly ActionTemplate[];
  candidateTemplates: readonly P2CandidateActionTemplate[];
}): ActionParseResult {
  validateCandidateTemplates(input.candidateTemplates);
  validateCandidateCatalog(input.visible);
  const p1Result = parseActionText({
    text: input.text,
    identity: input.identity,
    visible: {
      knownLocations: input.visible.knownLocations,
      npcPresence: input.visible.npcPresence,
      observationTargets: input.visible.observationTargets,
      clues: input.visible.clues,
      inventory: input.visible.inventory,
    },
    visibilityRevision: input.visibilityRevision,
    templates: input.p1Templates,
  });
  if (p1Result.status === 'ready' || p1Result.classification !== 'unknown') return p1Result;
  if (input.text.length > 4000 || input.visibilityRevision !== input.identity.expectedRevision) return p1Result;

  const text = normalize(input.text);
  if (!text || NEGATION_OR_CONDITION.test(text) || UNRESOLVED_REFERENCE.test(text)) return p1Result;
  const matches: CandidateMatch[] = [];
  const missingSlots: string[] = [];
  for (const template of input.candidateTemplates) {
    const parsed = matchCandidate(text, template, input.visible);
    if (parsed.kind === 'match') matches.push(...parsed.matches);
    else if (parsed.kind === 'missing') missingSlots.push(parsed.slot);
  }
  const uniqueMatches = dedupeMatches(matches);
  if (uniqueMatches.length === 1) {
    const match = uniqueMatches[0]!;
    const parsed = ActionIntentSchema.safeParse({
      ...input.identity,
      kind: match.template.kind,
      payload: match.payload,
    });
    if (parsed.success) return { status: 'ready', intent: parsed.data };
    return p1Result;
  }
  if (uniqueMatches.length > 1) return candidateAmbiguity(input.identity, uniqueMatches);
  const uniqueMissing = [...new Set(missingSlots)];
  if (uniqueMissing.length > 0) return candidateMissing(input.identity, uniqueMissing[0]!);
  return p1Result;
}

type CandidateMatch = {
  template: P2CandidateActionTemplate;
  target: VisibleTarget;
  payload: Readonly<Record<string, unknown>>;
  label: string;
};

function matchCandidate(text: string, template: P2CandidateActionTemplate, visible: P2CandidateVisibleCatalog):
  | { kind: 'match'; matches: CandidateMatch[] }
  | { kind: 'missing'; slot: string }
  | { kind: 'none' } {
  const prefix = normalize(template.prefix);
  const suffix = normalize(template.suffix ?? '');
  if (!text.startsWith(prefix)) return { kind: 'none' };
  const afterPrefix = text.slice(prefix.length);
  const targets = visible[template.entitySource] ?? [];
  const matches: CandidateMatch[] = [];
  for (const target of targets) {
    for (const alias of new Set([target.label, ...(target.aliases ?? [])].map(normalize).filter(Boolean))) {
      if (suffix && !afterPrefix.endsWith(suffix)) continue;
      const targetText = suffix ? afterPrefix.slice(0, -suffix.length) : afterPrefix;
      if (normalize(targetText) !== alias) continue;
      const slot = slotFor(template.kind);
      const payload = { ...(template.fixedPayload ?? {}), [slot]: target.id };
      matches.push({ template, target, payload,
        label: `${template.prefix}${target.disambiguator ? `${target.label}（${target.disambiguator}）` : target.label}${template.suffix ?? ''}` });
    }
  }
  if (matches.length > 0) return { kind: 'match', matches };
  if (!afterPrefix || (suffix && afterPrefix === suffix)) return { kind: 'missing', slot: slotFor(template.kind) };
  return { kind: 'none' };
}

function dedupeMatches(matches: readonly CandidateMatch[]): CandidateMatch[] {
  const order = new Map(['move', 'acquire_item', 'use_item', 'combat', 'quest'].map((kind, index) => [kind, index]));
  const unique = new Map<string, CandidateMatch>();
  for (const match of matches) {
    const key = `${match.template.kind}\0${stableJson(match.payload)}`;
    const current = unique.get(key);
    if (!current || match.label < current.label || (match.label === current.label && match.template.id < current.template.id)) unique.set(key, match);
  }
  return [...unique.values()].sort((left, right) => (order.get(left.template.kind)! - order.get(right.template.kind)!)
    || compareText(left.target.id, right.target.id) || compareText(left.template.id, right.template.id));
}

function candidateAmbiguity(identity: Parameters<typeof parseActionText>[0]['identity'], matches: readonly CandidateMatch[]): ActionParseResult {
  const candidates = matches.slice(0, 4).map(match => ({ kind: match.template.kind, label: match.label, slots: match.payload }));
  const question = matches.length > 4 || new Set(candidates.map(item => item.label)).size !== candidates.length
    ? '这句话对应多个可见目标，请补充地点或对象特征。' : '你想做下面哪一项？';
  const safeCandidates = question === '你想做下面哪一项？' ? candidates : [];
  return clarify('ambiguous', identity, question, [], safeCandidates, question);
}

function candidateMissing(identity: Parameters<typeof parseActionText>[0]['identity'], slot: string): ActionParseResult {
  const questionBySlot: Readonly<Record<string, string>> = {
    destinationId: '你想去哪个可见地点？', itemId: '你想拾取或使用哪件可见物品？',
    targetId: '你想对哪个当前可见目标行动？', questId: '你想领取哪项当前可用奖励？',
  };
  return clarify('missing', identity, questionBySlot[slot] ?? '请补充一个当前可见目标。', [slot], []);
}

function clarify(
  classification: 'missing' | 'ambiguous',
  identity: Parameters<typeof parseActionText>[0]['identity'],
  question: string,
  missingSlots: readonly string[],
  candidates: readonly { kind: ActionIntent['kind']; label: string; slots: Readonly<Record<string, unknown>> }[],
  presentationQuestion = question,
): ActionParseResult {
  const decision = DecisionV2Schema.parse({
    status: 'clarify', question, missingSlots: [...missingSlots], candidates: [...candidates],
    interactionId: identity.idempotencyKey,
    ...(identity.clarificationOf ? { clarificationOf: identity.clarificationOf } : {}),
    revision: identity.expectedRevision,
  });
  if (decision.status !== 'clarify') throw new Error('P2_CANDIDATE_CLARIFICATION_INVALID');
  return { status: 'clarify', classification, decision, presentationQuestion };
}

function slotFor(kind: P2CandidateActionTemplate['kind']): string {
  switch (kind) {
    case 'move': return 'destinationId';
    case 'acquire_item':
    case 'use_item': return 'itemId';
    case 'combat': return 'targetId';
    case 'quest': return 'questId';
  }
}

function validateCandidateTemplates(templates: readonly P2CandidateActionTemplate[]): void {
  if (!Array.isArray(templates)) throw new Error('P2_CANDIDATE_TEMPLATES_INVALID');
  const ids = new Set<string>();
  for (const template of templates) {
    if (!template || !template.id.trim() || template.id.length > 80 || ids.has(template.id)
      || !normalize(template.prefix) || template.prefix.length > 80 || (template.suffix?.length ?? 0) > 80
      || NEGATION_OR_CONDITION.test(template.prefix) || UNRESOLVED_REFERENCE.test(template.prefix)
      || !sourceMatchesKind(template.kind, template.entitySource)) throw new Error('P2_CANDIDATE_TEMPLATE_INVALID');
    ids.add(template.id);
  }
}

function validateCandidateCatalog(visible: P2CandidateVisibleCatalog): void {
  for (const source of ['sublocations', 'returnLocations', 'acquisitionTargets', 'combatTargets', 'questTargets'] as const) {
    const targets = visible[source] ?? [];
    const ids = new Set<string>();
    for (const target of targets) {
      if (!target.id || !target.label || target.label.length > 240 || ids.has(target.id)
        || (target.disambiguator !== undefined && target.disambiguator.length > 80)) throw new Error('P2_CANDIDATE_CATALOG_INVALID');
      ids.add(target.id);
      for (const alias of target.aliases ?? []) if (!normalize(alias) || alias.length > 240) throw new Error('P2_CANDIDATE_CATALOG_INVALID');
    }
  }
}

function sourceMatchesKind(kind: P2CandidateActionTemplate['kind'], source: CandidateEntitySource): boolean {
  return kind === 'move' ? source === 'sublocations' || source === 'returnLocations'
    : kind === 'acquire_item' ? source === 'acquisitionTargets'
      : kind === 'use_item' ? source === 'inventory'
        : kind === 'combat' ? source === 'combatTargets' : source === 'questTargets';
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').replace(/[。！!？?，,；;]+$/u, '').trim();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => compareText(left, right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

const NEGATION_OR_CONDITION = /(?:不要|別|别|不去|不想|不應|不应|不能|没|未|如果|假如|要是|除非|等到|等.+再)/u;
const UNRESOLVED_REFERENCE = /(?:那边|那兒|那儿|这里|這裡|那里|那裡|这个|這個|那个|那個|它|他|她|刚才|剛才|之前|上次)/u;
