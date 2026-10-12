import type { MemoryMode } from '@jiuxiao/contracts';
import { recallAuthorizedObservations, type AuthorizedRecallObservation, type RecallSlot } from '@jiuxiao/domain';

export type P7ResourceClass = 'renewable' | 'scarce';
export type P7EventFrequency = 'normal' | 'low';
export type P7EventWeight = 'normal' | 'high';

/**
 * Candidate-only, version-pinned P7 policy. This module is not installed by the
 * production turn host. Environment event definitions remain empty until an
 * independently reviewed, trusted-host allowlist is supplied.
 */
export const P7_CANDIDATE_POLICY = deepFreeze({
  version: 'p7-causal-offline-v3-candidate',
  microWindowMinutes: 15,
  mainWindowEndMinutes: 12 * 60,
  opportunityWindowEndMinutes: 48 * 60,
  longWindowBucketMinutes: 12 * 60,
  rupturePressureThreshold: 3,
  maxReturnCards: 3,
  renewableFloorBasisPoints: 2_500,
  scarceFloorBasisPoints: 0,
  capsuleMultiplierBasisPoints: 10_000,
} as const);

export type P7Policy = typeof P7_CANDIDATE_POLICY;

export type P7TimeCapsuleTemplate = {
  capsuleId: string;
  text: string;
  perspective: 'npc' | 'object' | 'scene';
  sourceNpcId: string;
  memoryClass: RecallSlot;
  memoryCue: string;
  impressionPrompt: string;
};

/** Immutable code-owned definition installed by a trusted host after review. */
export type P7EnvironmentEventDefinition = {
  eventId: string;
  version: string;
  eventClass: 'environment' | 'character';
  actorAbsent: boolean;
  protagonistInvolved: boolean;
  causedByProtagonist: boolean;
  reversible: boolean;
  changesIdentity: boolean;
  changesRelationship: boolean;
  changesMoralStance: boolean;
  exclusiveOutcomeCount: number;
  requiresPlayerChoice: boolean;
  frequency: P7EventFrequency;
  weight: P7EventWeight;
  resourceOutputs: readonly { resourceId: string; resourceClass: P7ResourceClass; quantityMicrounits: number }[];
  capsule?: P7TimeCapsuleTemplate;
};

export type P7ScheduledEnvironmentEvent = {
  eventId: string;
  occurrenceId: string;
  elapsedMinute: number;
};

export type P7CausalRupture = {
  ruptureId: string;
  priority: number;
  createdAtGameMinute: number;
  choices: readonly { choiceId: string; outcomeId: string }[];
  releaseByChoice: Readonly<Record<string, string>>;
  conservativeOutcomeId: string;
  conservativeReleaseIsReversible: boolean;
  conservativeReleaseChangesCharacter: boolean;
  conservativeReleaseRequiresChoice: boolean;
};

export type P7TimeCapsule = {
  capsuleId: string;
  saveId: string;
  memoryMode: MemoryMode;
  text: string;
  perspective: P7TimeCapsuleTemplate['perspective'];
  sourceNpcId: string;
  sourceGrantId: string;
  memoryClass: RecallSlot;
  memoryCue: string;
  impressionPrompt: string;
  createdAtElapsedMinute: number;
};

export type P7OfflineCatchUpPlan = {
  policyVersion: string;
  saveId: string;
  memoryMode: MemoryMode;
  checkpointId: string;
  checkpointRevision: number;
  returnRevision: number;
  checkpointGameMinute: number;
  returnGameMinute: number;
  catchUpId: string;
  elapsedMinutes: number;
  window: 'micro' | 'main' | 'long' | 'loss-only';
  fullRateOpportunityMinutes: number;
  lowRateOpportunityMinutes: number;
  lossLayerElapsedMinutes: number;
  outputMultiplierBasisPoints: { renewable: number; scarce: number; narrative: number };
  environmentSettlements: readonly {
    occurrenceId: string;
    eventId: string;
    elapsedMinute: number;
    outputs: readonly { resourceId: string; resourceClass: P7ResourceClass; quantityMicrounits: number }[];
    capsuleTemplate?: P7TimeCapsuleTemplate;
  }[];
  rejectedOccurrences: readonly { occurrenceId: string; reason: string }[];
  causalReturn: P7CausalReturnPlan;
  worldTemperature: 'warm' | 'settling' | 'cool';
  onlineContinuityCue: boolean;
};

export type P7CausalReturnPlan = {
  primary: P7CausalRupture | null;
  background: readonly { rupture: P7CausalRupture; reason: 'secondary' | 'pressure-threshold' }[];
  conservativeAutoReleases: readonly { ruptureId: string; outcomeId: string }[];
  pendingIdsAfterPreview: readonly string[];
};

export type P7RuptureResolution = {
  ruptureId: string;
  outcomeId: string;
  resolvedBy: 'player-choice' | 'conservative-pressure-release';
};

export type P7ReturnBrief = {
  cards: readonly P7TimeCapsule[];
  archivedCapsuleIds: readonly string[];
  skippedByMemoryPolicy: readonly string[];
};

export const P7_ENVIRONMENT_EVENT_ALLOWLIST: Readonly<Record<string, P7EnvironmentEventDefinition>> = deepFreeze({});

/**
 * Builds a deterministic plan from a fixed policy and trusted, code-owned
 * allowlist. Supplying test definitions is solely for isolated simulation.
 */
export function planP7OfflineCatchUp(input: {
  saveId: string;
  memoryMode: MemoryMode;
  checkpointId: string;
  checkpointRevision: number;
  returnRevision: number;
  checkpointGameMinute: number;
  returnGameMinute: number;
  startedAtMs: number;
  returnedAtMs: number;
  scheduledEvents: readonly P7ScheduledEnvironmentEvent[];
  ruptures: readonly P7CausalRupture[];
  allowlist?: Readonly<Record<string, P7EnvironmentEventDefinition>>;
  policy?: P7Policy;
  recentAuthorizedOnlineAction: boolean;
}): P7OfflineCatchUpPlan {
  validateInput(input);
  const policy = input.policy ?? P7_CANDIDATE_POLICY;
  validatePolicy(policy);
  if (input.checkpointRevision !== input.returnRevision || input.checkpointGameMinute !== input.returnGameMinute) {
    throw new Error('P7_CHECKPOINT_WORLD_DRIFT');
  }
  const elapsedMinutes = p7ElapsedMinutes(input.startedAtMs, input.returnedAtMs);
  const window = offlineWindow(elapsedMinutes, policy);
  const multipliers = outputMultipliers(elapsedMinutes, policy);
  const allowlist = input.allowlist ?? P7_ENVIRONMENT_EVENT_ALLOWLIST;
  const selected = selectScheduledOccurrences(input.scheduledEvents, allowlist, elapsedMinutes, window, policy);
  const causalReturn = window === 'micro' ? deferCausalReturn(input.ruptures) : planCausalReturn(input.ruptures, policy);
  const temperature = temperatureFor(elapsedMinutes, policy);
  return {
    policyVersion: policy.version,
    saveId: input.saveId,
    memoryMode: input.memoryMode,
    checkpointId: input.checkpointId,
    checkpointRevision: input.checkpointRevision,
    returnRevision: input.returnRevision,
    checkpointGameMinute: input.checkpointGameMinute,
    returnGameMinute: input.returnGameMinute,
    catchUpId: p7CatchUpId(input.saveId, input.memoryMode, input.checkpointId, policy.version),
    elapsedMinutes,
    window,
    fullRateOpportunityMinutes: window === 'micro' ? 0
      : Math.max(0, Math.min(elapsedMinutes, policy.mainWindowEndMinutes) - policy.microWindowMinutes),
    lowRateOpportunityMinutes: window === 'long'
      ? Math.max(0, Math.min(elapsedMinutes, policy.opportunityWindowEndMinutes) - policy.mainWindowEndMinutes) : 0,
    // This is elapsed physical time for the loss layer, not a gameplay clock delta.
    lossLayerElapsedMinutes: window === 'micro' ? 0 : elapsedMinutes,
    outputMultiplierBasisPoints: multipliers,
    environmentSettlements: selected.settlements,
    rejectedOccurrences: selected.rejected,
    causalReturn,
    worldTemperature: temperature,
    onlineContinuityCue: input.recentAuthorizedOnlineAction && temperature === 'warm',
  };
}

/** Clocks that move backwards or repeat the same checkpoint never create time. */
export function p7ElapsedMinutes(startedAtMs: number, returnedAtMs: number): number {
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0 || !Number.isSafeInteger(returnedAtMs) || returnedAtMs < 0) {
    throw new Error('P7_CLOCK_INVALID');
  }
  return Math.floor(Math.max(0, returnedAtMs - startedAtMs) / 60_000);
}

/** A capsule is stored permanently; recall permission controls display in both modes. */
export function buildP7ReturnBrief(input: {
  saveId: string;
  capsules: readonly P7TimeCapsule[];
  memoryMode: MemoryMode;
  memoryProjection: {
    saveId: string;
    memoryMode: MemoryMode;
    throughRevision: number;
    observations: readonly AuthorizedRecallObservation[];
  };
  gameMinute: number;
  maxCards?: number;
}): P7ReturnBrief {
  const maxCards = input.maxCards ?? P7_CANDIDATE_POLICY.maxReturnCards;
  if (!input.saveId.trim() || !['continue', 'forgetting'].includes(input.memoryMode)
    || !Array.isArray(input.capsules) || !input.memoryProjection
    || input.memoryProjection.saveId !== input.saveId || input.memoryProjection.memoryMode !== input.memoryMode
    || !Number.isSafeInteger(input.memoryProjection.throughRevision) || input.memoryProjection.throughRevision < 0
    || !Array.isArray(input.memoryProjection.observations)
    || !Number.isSafeInteger(input.gameMinute) || input.gameMinute < 0
    || !Number.isSafeInteger(maxCards) || maxCards < 1 || maxCards > 3) throw new Error('P7_RETURN_CARD_LIMIT_INVALID');
  if (new Set(input.capsules.map(capsule => capsule.capsuleId)).size !== input.capsules.length) {
    throw new Error('P7_CAPSULE_ID_DUPLICATE');
  }
  for (const capsule of input.capsules) validateStoredCapsule(capsule);
  const inScope = input.capsules.filter(capsule => capsule.saveId === input.saveId && capsule.memoryMode === input.memoryMode);
  const accessible = inScope.filter(capsule => {
    const npcObservations = input.memoryProjection.observations.filter(row => row.saveId === input.saveId
      && row.npcId === capsule.sourceNpcId);
    const recall = recallAuthorizedObservations(npcObservations, {
      query: capsule.memoryCue,
      slot: capsule.memoryClass,
      gameMinute: input.gameMinute,
      throughRevision: input.memoryProjection.throughRevision,
      forgetting: input.memoryMode === 'forgetting',
    });
    return recall.status === 'complete' && recall.grantId === capsule.sourceGrantId;
  })
    .sort((left, right) => right.createdAtElapsedMinute - left.createdAtElapsedMinute
      || compareText(left.capsuleId, right.capsuleId));
  const accessibleIds = new Set(accessible.map(capsule => capsule.capsuleId));
  const inaccessible = input.capsules.filter(capsule => !accessibleIds.has(capsule.capsuleId)).map(capsule => capsule.capsuleId);
  const cards = accessible.slice(0, maxCards);
  return {
    cards: structuredClone(cards),
    archivedCapsuleIds: accessible.slice(maxCards).map(capsule => capsule.capsuleId),
    skippedByMemoryPolicy: inaccessible,
  };
}

/** Yes/no micro-confirmation is a presentation receipt and cannot write world state. */
export function recordP7MicroConfirmation(capsuleId: string, impression: 'affirm' | 'deny'): {
  capsuleId: string;
  impression: 'affirm' | 'deny';
  kind: 'micro-confirmation';
  writesWorldState: false;
} {
  if (typeof capsuleId !== 'string' || !capsuleId.trim()) throw new Error('P7_CAPSULE_ID_INVALID');
  if (impression !== 'affirm' && impression !== 'deny') throw new Error('P7_IMPRESSION_INVALID');
  return { capsuleId, impression, kind: 'micro-confirmation', writesWorldState: false };
}

export function materializeP7TimeCapsule(input: {
  saveId: string;
  memoryMode: MemoryMode;
  catchUpId: string;
  occurrenceId: string;
  elapsedMinute: number;
  template: P7TimeCapsuleTemplate;
  authorizedGrant: { grantId: string; npcId: string };
}): P7TimeCapsule {
  validateP7TimeCapsuleTemplate(input.template);
  if (!input.saveId.trim() || !input.catchUpId.trim() || !input.occurrenceId.trim()
    || !input.authorizedGrant.grantId.trim() || input.authorizedGrant.npcId !== input.template.sourceNpcId
    || !Number.isSafeInteger(input.elapsedMinute) || input.elapsedMinute < 0) {
    throw new Error('P7_CAPSULE_MEMORY_SCOPE_INVALID');
  }
  return {
    capsuleId: `${input.catchUpId}:${input.occurrenceId}:${input.template.capsuleId}`,
    saveId: input.saveId,
    memoryMode: input.memoryMode,
    text: input.template.text,
    perspective: input.template.perspective,
    sourceNpcId: input.template.sourceNpcId,
    sourceGrantId: input.authorizedGrant.grantId,
    memoryClass: input.template.memoryClass,
    memoryCue: input.template.memoryCue,
    impressionPrompt: input.template.impressionPrompt,
    createdAtElapsedMinute: input.elapsedMinute,
  };
}

export function validateP7TimeCapsuleTemplate(capsule: P7TimeCapsuleTemplate): void {
  if (typeof capsule.capsuleId !== 'string' || !capsule.capsuleId.trim()
    || typeof capsule.sourceNpcId !== 'string' || !capsule.sourceNpcId.trim()
    || !['current-state', 'historical-event', 'subjective-belief'].includes(capsule.memoryClass)
    || typeof capsule.memoryCue !== 'string' || !capsule.memoryCue.trim() || capsule.memoryCue.length > 160
    || typeof capsule.impressionPrompt !== 'string' || !capsule.impressionPrompt.trim()
    || typeof capsule.text !== 'string' || !['npc', 'object', 'scene'].includes(capsule.perspective)) {
    throw new Error('P7_CAPSULE_FIELDS_INVALID');
  }
  const codepoints = [...capsule.text];
  const sentences = codepoints.join('').split(/[。！？!?]+/u).filter(sentence => sentence.trim().length > 0);
  if (codepoints.length > 70 || sentences.length < 1 || sentences.length > 2
    || /(?:主角|玩家|你)(?:觉得|想起|想要|感到|回忆|记得|害怕|希望|认为|意识到)|(?:主角|玩家)(?:的内心|心里)/u.test(capsule.text)
    || [...capsule.impressionPrompt].length > 24) {
    throw new Error('P7_CAPSULE_CONTENT_INVALID');
  }
}

/** Returns exactly one unskippable rupture; excess pressure never silently drops. */
export function planCausalReturn(
  ruptures: readonly P7CausalRupture[],
  policy: P7Policy = P7_CANDIDATE_POLICY,
): P7CausalReturnPlan {
  const sorted = validateAndSortRuptures(ruptures);
  if (sorted.length === 0) return { primary: null, background: [], conservativeAutoReleases: [], pendingIdsAfterPreview: [] };
  const primary = sorted[0]!;
  const keptBackground = sorted.slice(1, policy.rupturePressureThreshold);
  const background = keptBackground.map((rupture, index) => ({
    rupture,
    reason: sorted.length === policy.rupturePressureThreshold && index === 0
      ? 'pressure-threshold' as const : 'secondary' as const,
  }));
  if (background.some(item => primary.choices.some(choice => {
    const outcomeId = item.rupture.releaseByChoice[choice.choiceId];
    return typeof outcomeId !== 'string' || !outcomeId.trim();
  }))) throw new Error('P7_BACKGROUND_RELEASE_NOT_AUTHORED');
  const overflow = sorted.slice(policy.rupturePressureThreshold);
  const conservativeAutoReleases = overflow.map(rupture => {
    assertConservativeRelease(rupture);
    return { ruptureId: rupture.ruptureId, outcomeId: rupture.conservativeOutcomeId };
  });
  return {
    primary,
    background,
    conservativeAutoReleases,
    pendingIdsAfterPreview: [primary.ruptureId, ...background.map(item => item.rupture.ruptureId)],
  };
}

/** Micro departures cannot surface or settle offline pressure; keep every item pending. */
function deferCausalReturn(ruptures: readonly P7CausalRupture[]): P7CausalReturnPlan {
  const sorted = validateAndSortRuptures(ruptures);
  return {
    primary: null,
    background: [],
    conservativeAutoReleases: [],
    pendingIdsAfterPreview: sorted.map(rupture => rupture.ruptureId),
  };
}

/** Resolving the one presented rupture releases all other pending pressure. */
export function resolveP7CausalChoice(
  plan: P7CausalReturnPlan,
  choiceId: string,
): readonly P7RuptureResolution[] {
  if (!plan.primary) throw new Error('P7_CAUSAL_RUPTURE_NOT_PENDING');
  const primaryChoice = plan.primary.choices.find(choice => choice.choiceId === choiceId);
  if (!primaryChoice) throw new Error('P7_CAUSAL_CHOICE_NOT_AUTHORIZED');
  const resolutions: P7RuptureResolution[] = [{
    ruptureId: plan.primary.ruptureId,
    outcomeId: primaryChoice.outcomeId,
    resolvedBy: 'player-choice',
  }];
  for (const item of plan.background) {
    const outcomeId = item.rupture.releaseByChoice[choiceId];
    if (typeof outcomeId !== 'string' || !outcomeId.trim()) throw new Error('P7_BACKGROUND_RELEASE_NOT_AUTHORED');
    resolutions.push({ ruptureId: item.rupture.ruptureId, outcomeId, resolvedBy: 'player-choice' });
  }
  for (const item of plan.conservativeAutoReleases) {
    resolutions.push({ ...item, resolvedBy: 'conservative-pressure-release' });
  }
  return resolutions;
}

export function p7CatchUpId(saveId: string, memoryMode: MemoryMode, checkpointId: string,
  policyVersion: string = P7_CANDIDATE_POLICY.version): string {
  if (!saveId.trim() || !checkpointId.trim() || !['continue', 'forgetting'].includes(memoryMode)) {
    throw new Error('P7_CATCHUP_SCOPE_INVALID');
  }
  if (!policyVersion.trim()) throw new Error('P7_CATCHUP_POLICY_VERSION_INVALID');
  // Freeze one settlement identity for the entire checkpoint. A retry with a
  // later wall-clock sample must recover the already stored plan, not mint a
  // second settlement ID for the same absence window.
  return `p7:${encodeURIComponent(saveId)}:${memoryMode}:${encodeURIComponent(checkpointId)}:${policyVersion}`;
}

function offlineWindow(minutes: number, policy: P7Policy): P7OfflineCatchUpPlan['window'] {
  if (minutes <= policy.microWindowMinutes) return 'micro';
  if (minutes <= policy.mainWindowEndMinutes) return 'main';
  if (minutes <= policy.opportunityWindowEndMinutes) return 'long';
  return 'loss-only';
}

function outputMultipliers(minutes: number, policy: P7Policy): P7OfflineCatchUpPlan['outputMultiplierBasisPoints'] {
  if (minutes <= policy.microWindowMinutes || minutes > policy.opportunityWindowEndMinutes) {
    return { renewable: 0, scarce: 0, narrative: 10_000 };
  }
  if (minutes <= policy.mainWindowEndMinutes) {
    // The authored main window stays full-rate for every resource class through
    // exactly 12h. The long-window curve starts from that same 100% boundary.
    return { renewable: 10_000, scarce: 10_000, narrative: 10_000 };
  }
  const longSpan = policy.opportunityWindowEndMinutes - policy.mainWindowEndMinutes;
  const elapsedLong = Math.min(minutes - policy.mainWindowEndMinutes, longSpan);
  const renewable = interpolateFloor(elapsedLong, longSpan, policy.renewableFloorBasisPoints);
  const scarce = interpolateFloor(elapsedLong, longSpan, policy.scarceFloorBasisPoints);
  return { renewable, scarce, narrative: policy.capsuleMultiplierBasisPoints };
}

function interpolateFloor(elapsed: number, span: number, floor: number): number {
  return Math.max(floor, 10_000 - Math.floor((10_000 - floor) * elapsed / span));
}

function selectScheduledOccurrences(
  scheduled: readonly P7ScheduledEnvironmentEvent[],
  allowlist: Readonly<Record<string, P7EnvironmentEventDefinition>>,
  elapsedMinutes: number,
  window: P7OfflineCatchUpPlan['window'],
  policy: P7Policy,
) {
  const rejected: { occurrenceId: string; reason: string }[] = [];
  const candidates: { schedule: P7ScheduledEnvironmentEvent; definition: P7EnvironmentEventDefinition }[] = [];
  const seenOccurrences = new Set<string>();
  for (const candidateSchedule of scheduled as readonly unknown[]) {
    if (!candidateSchedule || typeof candidateSchedule !== 'object') {
      rejected.push({ occurrenceId: '<invalid>', reason: 'invalid-scheduled-occurrence' });
      continue;
    }
    const schedule = candidateSchedule as P7ScheduledEnvironmentEvent;
    const occurrenceId = typeof schedule.occurrenceId === 'string' ? schedule.occurrenceId : '';
    if (!occurrenceId.trim() || seenOccurrences.has(occurrenceId)) {
      rejected.push({ occurrenceId: occurrenceId || '<invalid>', reason: 'duplicate-or-invalid-occurrence' });
      continue;
    }
    seenOccurrences.add(occurrenceId);
    if (typeof schedule.eventId !== 'string' || !schedule.eventId.trim()) {
      rejected.push({ occurrenceId, reason: 'invalid-scheduled-event-id' });
      continue;
    }
    if (!Number.isSafeInteger(schedule.elapsedMinute) || schedule.elapsedMinute <= policy.microWindowMinutes
      || schedule.elapsedMinute > elapsedMinutes) {
      rejected.push({ occurrenceId, reason: 'outside-settlement-window' });
      continue;
    }
    const definition = allowlist[schedule.eventId];
    if (!definition) { rejected.push({ occurrenceId, reason: 'event-not-allowlisted' }); continue; }
    if (definition.eventId !== schedule.eventId) {
      rejected.push({ occurrenceId, reason: 'event-allowlist-key-mismatch' });
      continue;
    }
    const admission = environmentEventAdmission(definition);
    if (!admission.ok) { rejected.push({ occurrenceId, reason: admission.reason }); continue; }
    if (window === 'loss-only' || schedule.elapsedMinute > policy.opportunityWindowEndMinutes) {
      rejected.push({ occurrenceId, reason: 'opportunity-window-frozen' });
      continue;
    }
    if (schedule.elapsedMinute > policy.mainWindowEndMinutes
      && (definition.frequency !== 'low' || definition.weight !== 'high')) {
      rejected.push({ occurrenceId, reason: 'long-window-requires-low-frequency-high-weight' });
      continue;
    }
    candidates.push({ schedule, definition });
  }
  const main = candidates.filter(item => item.schedule.elapsedMinute <= policy.mainWindowEndMinutes);
  const long = candidates.filter(item => item.schedule.elapsedMinute > policy.mainWindowEndMinutes)
    .sort((left, right) => left.schedule.elapsedMinute - right.schedule.elapsedMinute
      || compareText(left.definition.eventId, right.definition.eventId)
      || compareText(left.schedule.occurrenceId, right.schedule.occurrenceId));
  const bucketWinners = new Map<number, typeof candidates[number]>();
  for (const candidate of long) {
    const bucket = Math.floor((candidate.schedule.elapsedMinute - policy.mainWindowEndMinutes - 1)
      / policy.longWindowBucketMinutes);
    const current = bucketWinners.get(bucket);
    if (!current || compareText(candidate.definition.eventId, current.definition.eventId) < 0
      || (candidate.definition.eventId === current.definition.eventId
        && compareText(candidate.schedule.occurrenceId, current.schedule.occurrenceId) < 0)) bucketWinners.set(bucket, candidate);
    else rejected.push({ occurrenceId: candidate.schedule.occurrenceId, reason: 'long-window-frequency-budget' });
  }
  const accepted = [...main, ...bucketWinners.values()].sort((left, right) => left.schedule.elapsedMinute - right.schedule.elapsedMinute
    || compareText(left.schedule.occurrenceId, right.schedule.occurrenceId));
  const settlements = accepted.map(({ schedule, definition }) => {
    const multiplier = outputMultipliers(schedule.elapsedMinute, policy);
    return {
      occurrenceId: schedule.occurrenceId,
      eventId: definition.eventId,
      elapsedMinute: schedule.elapsedMinute,
      outputs: definition.resourceOutputs.map(output => ({
        ...output,
        quantityMicrounits: Math.floor(output.quantityMicrounits
          * (output.resourceClass === 'renewable' ? multiplier.renewable : multiplier.scarce) / 10_000),
      })),
      ...(definition.capsule ? { capsuleTemplate: structuredClone(definition.capsule) } : {}),
    };
  });
  return { settlements, rejected };
}

function environmentEventAdmission(event: P7EnvironmentEventDefinition): { ok: true } | { ok: false; reason: string } {
  if (!event || typeof event !== 'object' || event.eventClass !== 'environment' || event.actorAbsent !== true
    || event.protagonistInvolved !== false || event.causedByProtagonist !== false) {
    return { ok: false, reason: 'character-event-or-protagonist-involved' };
  }
  if (event.reversible !== true) return { ok: false, reason: 'environment-event-not-reversible' };
  if (event.changesIdentity !== false || event.changesRelationship !== false || event.changesMoralStance !== false) {
    return { ok: false, reason: 'character-fact-change-forbidden' };
  }
  if (!Number.isSafeInteger(event.exclusiveOutcomeCount) || event.exclusiveOutcomeCount !== 1 || event.requiresPlayerChoice !== false) {
    return { ok: false, reason: 'branch-or-player-choice-required' };
  }
  if (!['normal', 'low'].includes(event.frequency) || !['normal', 'high'].includes(event.weight)) {
    return { ok: false, reason: 'environment-schedule-classification-invalid' };
  }
  if (typeof event.eventId !== 'string' || !event.eventId.trim() || typeof event.version !== 'string' || !event.version.trim()
    || !Array.isArray(event.resourceOutputs)
    || event.resourceOutputs.some(output => !output || typeof output.resourceId !== 'string' || !output.resourceId.trim()
      || !['renewable', 'scarce'].includes(output.resourceClass) || !Number.isSafeInteger(output.quantityMicrounits)
      || output.quantityMicrounits < 0)
    || new Set(event.resourceOutputs.map(output => output.resourceId)).size !== event.resourceOutputs.length) {
    return { ok: false, reason: 'environment-definition-invalid' };
  }
  if (event.capsule) {
    try { validateP7TimeCapsuleTemplate(event.capsule); }
    catch { return { ok: false, reason: 'time-capsule-invalid' }; }
  }
  return { ok: true };
}

function validateAndSortRuptures(ruptures: readonly P7CausalRupture[]): P7CausalRupture[] {
  if (!Array.isArray(ruptures) || ruptures.some(item => !item || typeof item !== 'object')
    || new Set(ruptures.map(item => item.ruptureId)).size !== ruptures.length) {
    throw new Error('P7_RUPTURE_LIST_INVALID');
  }
  for (const rupture of ruptures as readonly P7CausalRupture[]) {
    if (typeof rupture.ruptureId !== 'string' || !rupture.ruptureId.trim() || !Number.isSafeInteger(rupture.priority)
      || !Number.isSafeInteger(rupture.createdAtGameMinute) || rupture.createdAtGameMinute < 0
      || !Array.isArray(rupture.choices) || rupture.choices.length === 0
      || rupture.choices.some(choice => !choice || typeof choice.choiceId !== 'string' || !choice.choiceId.trim()
        || typeof choice.outcomeId !== 'string' || !choice.outcomeId.trim())
      || new Set(rupture.choices.map(choice => choice.choiceId)).size !== rupture.choices.length
      || typeof rupture.conservativeOutcomeId !== 'string' || !rupture.conservativeOutcomeId.trim()
      || typeof rupture.conservativeReleaseIsReversible !== 'boolean'
      || typeof rupture.conservativeReleaseChangesCharacter !== 'boolean'
      || typeof rupture.conservativeReleaseRequiresChoice !== 'boolean'
      || !rupture.releaseByChoice || typeof rupture.releaseByChoice !== 'object'
      || Object.entries(rupture.releaseByChoice).some(([choiceId, outcomeId]) => !choiceId.trim()
        || typeof outcomeId !== 'string' || !outcomeId.trim())
      || Object.entries(rupture.releaseByChoice).some(([choiceId]) => !rupture.choices.some(choice => choice.choiceId === choiceId))) {
      throw new Error('P7_RUPTURE_DEFINITION_INVALID');
    }
  }
  return [...ruptures].map(item => structuredClone(item)).sort((left, right) => right.priority - left.priority
    || left.createdAtGameMinute - right.createdAtGameMinute || compareText(left.ruptureId, right.ruptureId));
}

function assertConservativeRelease(rupture: P7CausalRupture): void {
  if (!rupture.conservativeReleaseIsReversible || rupture.conservativeReleaseChangesCharacter
    || rupture.conservativeReleaseRequiresChoice) throw new Error('P7_CONSERVATIVE_RELEASE_NOT_SAFE');
}

function temperatureFor(minutes: number, policy: P7Policy): P7OfflineCatchUpPlan['worldTemperature'] {
  if (minutes <= policy.mainWindowEndMinutes) return 'warm';
  if (minutes <= policy.opportunityWindowEndMinutes) return 'settling';
  return 'cool';
}

function validateStoredCapsule(capsule: P7TimeCapsule): void {
  validateP7TimeCapsuleTemplate({
    capsuleId: capsule.capsuleId,
    text: capsule.text,
    perspective: capsule.perspective,
    sourceNpcId: capsule.sourceNpcId,
    memoryClass: capsule.memoryClass,
    memoryCue: capsule.memoryCue,
    impressionPrompt: capsule.impressionPrompt,
  });
  if (!capsule.saveId.trim() || !['continue', 'forgetting'].includes(capsule.memoryMode)
    || !capsule.sourceGrantId.trim() || !Number.isSafeInteger(capsule.createdAtElapsedMinute)
    || capsule.createdAtElapsedMinute < 0) throw new Error('P7_CAPSULE_SCOPE_INVALID');
}

function validatePolicy(policy: P7Policy): void {
  if (!policy || policy.version !== P7_CANDIDATE_POLICY.version
    || policy.microWindowMinutes !== 15 || policy.mainWindowEndMinutes !== 720
    || policy.opportunityWindowEndMinutes !== 2880 || policy.longWindowBucketMinutes !== 720
    || policy.rupturePressureThreshold !== 3 || policy.maxReturnCards !== 3
    || policy.renewableFloorBasisPoints !== 2500 || policy.scarceFloorBasisPoints !== 0
    || policy.capsuleMultiplierBasisPoints !== 10_000) throw new Error('P7_POLICY_ARTIFACT_MISMATCH');
}

function validateInput(input: {
  saveId: string;
  memoryMode: MemoryMode;
  checkpointId: string;
  checkpointRevision: number;
  returnRevision: number;
  checkpointGameMinute: number;
  returnGameMinute: number;
  startedAtMs: number;
  returnedAtMs: number;
  scheduledEvents: readonly P7ScheduledEnvironmentEvent[];
  ruptures: readonly P7CausalRupture[];
}): void {
  if (!input.saveId.trim() || !input.checkpointId.trim() || !['continue', 'forgetting'].includes(input.memoryMode)
    || !Number.isSafeInteger(input.checkpointRevision) || input.checkpointRevision < 0
    || !Number.isSafeInteger(input.returnRevision) || input.returnRevision < 0
    || !Number.isSafeInteger(input.checkpointGameMinute) || input.checkpointGameMinute < 0
    || !Number.isSafeInteger(input.returnGameMinute) || input.returnGameMinute < 0
    || !Number.isSafeInteger(input.startedAtMs) || input.startedAtMs < 0
    || !Number.isSafeInteger(input.returnedAtMs) || input.returnedAtMs < 0
    || !Array.isArray(input.scheduledEvents) || !Array.isArray(input.ruptures)) throw new Error('P7_INPUT_INVALID');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
