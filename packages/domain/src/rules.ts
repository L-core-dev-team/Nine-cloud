import {
  ActionIntentSchema,
  DecisionV2Schema,
  DomainEventSchema,
  SaveEnvelopeSchema,
  type ActionIntent,
  type DecisionV2,
  type DomainEvent,
  type SaveEnvelope,
} from '@jiuxiao/contracts';

export interface RuleInvocationContext {
  /** Supplied by the transaction boundary; reducers must not call Date.now(). */
  readonly occurredAt: string;
  /** Stable IDs are allocated before pure rule evaluation and reused on retry. */
  readonly eventIds: readonly string[];
}

export interface VersionedRuleModule {
  readonly ruleVersion: string;
  readonly canonVersion: string;
  decide(intent: ActionIntent, save: SaveEnvelope, context: RuleInvocationContext): DecisionV2;
}

export interface RuleContext extends RuleInvocationContext {
  readonly module?: VersionedRuleModule;
}

export interface RuleEventDraft {
  readonly type: string;
  readonly payload: DomainEvent['payload'];
}

/** Attach only transaction-owned metadata to reducer-authored event payloads. */
export function bindRuleEvents(
  drafts: readonly RuleEventDraft[],
  intent: ActionIntent,
  save: SaveEnvelope,
  context: RuleInvocationContext,
): DomainEvent[] {
  if (drafts.length > context.eventIds.length) throw new Error('RULE_EVENT_ID_CAPACITY');
  return drafts.map((draft, index) => DomainEventSchema.parse({
    ...draft,
    id: context.eventIds[index],
    saveId: save.saveId,
    branchId: intent.branchId,
    beforeRevision: save.revision,
    afterRevision: save.revision + 1,
    occurredAt: context.occurredAt,
    source: 'RULES',
    ruleVersion: save.ruleVersion,
  }));
}

/**
 * Dispatch only to the ruleset pinned by the save. Missing or mismatched
 * modules stay fail-closed; rule execution itself is deterministic and pure.
 */
export function evaluate(intent: ActionIntent, save: SaveEnvelope, context?: RuleContext): DecisionV2 {
  const candidateRevision = save && typeof save === 'object'
    ? (save as unknown as { revision?: unknown }).revision
    : undefined;
  const fallbackRevision = typeof candidateRevision === 'number'
    && Number.isSafeInteger(candidateRevision) && candidateRevision >= 0 ? candidateRevision : 0;
  const parsedIntent = ActionIntentSchema.safeParse(intent);
  const parsedSave = SaveEnvelopeSchema.safeParse(save);
  if (!parsedIntent.success || !parsedSave.success) {
    return rejected('ENV_PAYLOAD_INVALID', '行动或存档不符合当前契约，未结算。', fallbackRevision);
  }
  const action = parsedIntent.data;
  const snapshot = parsedSave.data;
  if (action.expectedRevision !== snapshot.revision) {
    return rejected('ENV_REVISION_STALE', '存档版本已变化，请重新确认行动。', snapshot.revision);
  }
  if (action.saveId !== snapshot.saveId) {
    return rejected('AUTH_UNAUTHORIZED_TARGET', '当前行动不属于这个存档。', snapshot.revision);
  }
  if (action.actorId !== snapshot.state.playerId) {
    return rejected('AUTH_ACTOR_MISMATCH', '当前角色不能代替存档所属玩家发起行动。', snapshot.revision);
  }

  const module = context?.module;
  if (!module || module.ruleVersion !== snapshot.ruleVersion || module.canonVersion !== snapshot.canonVersion) {
    return rejected('ENV_RULES_NOT_READY', '当前存档没有匹配的已签署规则集。', snapshot.revision);
  }
  if (!context || !validInvocationContext(context)) {
    return rejected('ENV_PAYLOAD_INVALID', '规则执行上下文无效，行动未结算。', snapshot.revision);
  }

  let parsed: ReturnType<typeof DecisionV2Schema.safeParse>;
  try {
    const immutableIntent = deepFreezeClone(action);
    const immutableSave = deepFreezeClone(snapshot);
    const immutableContext = Object.freeze({
      occurredAt: context.occurredAt,
      eventIds: Object.freeze([...context.eventIds]),
    });
    parsed = DecisionV2Schema.safeParse(module.decide(immutableIntent, immutableSave, immutableContext));
  } catch {
    return rejected('ENV_PAYLOAD_INVALID', '规则结果无效，行动未结算。', snapshot.revision);
  }
  if (!parsed.success || !validDecisionTransition(parsed.data, snapshot, context)) {
    return rejected('ENV_PAYLOAD_INVALID', '规则结果未通过提交契约校验，行动未结算。', snapshot.revision);
  }
  return parsed.data;
}

function validInvocationContext(context: RuleInvocationContext): boolean {
  return typeof context.occurredAt === 'string'
    && Array.isArray(context.eventIds)
    && context.eventIds.every(id => typeof id === 'string')
    && Number.isFinite(Date.parse(context.occurredAt))
    && new Date(context.occurredAt).toISOString() === context.occurredAt
    && context.eventIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    && new Set(context.eventIds).size === context.eventIds.length;
}

function validDecisionTransition(decision: ReturnType<typeof DecisionV2Schema.parse>, save: SaveEnvelope, context: RuleInvocationContext): boolean {
  if (decision.status !== 'accepted') return decision.revision === save.revision;
  if (decision.nextRevision !== save.revision + 1 || decision.events.length > context.eventIds.length) return false;
  return decision.events.every((event, index) => event.id === context.eventIds[index]
    && event.occurredAt === context.occurredAt
    && event.saveId === save.saveId
    && event.branchId === 'root'
    && event.beforeRevision === save.revision
    && event.afterRevision === decision.nextRevision
    && event.source === 'RULES'
    && event.ruleVersion === save.ruleVersion);
}

function rejected(code: `AUTH_${string}` | `ENV_${string}`, message: string, revision: number): DecisionV2 {
  return { status: 'rejected', code, message, revision };
}

function deepFreezeClone<T>(value: T): T {
  const copy = structuredClone(value);
  return freezeDeep(copy);
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
