import { describe, expect, it } from 'vitest';
import {
  P7_CANDIDATE_POLICY,
  P7_ENVIRONMENT_EVENT_ALLOWLIST,
  buildP7ReturnBrief,
  materializeP7TimeCapsule,
  p7CatchUpId,
  p7ElapsedMinutes,
  planCausalReturn,
  planP7OfflineCatchUp,
  recordP7MicroConfirmation,
  resolveP7CausalChoice,
  validateP7TimeCapsuleTemplate,
  type P7CausalRupture,
  type P7EnvironmentEventDefinition,
  type P7ScheduledEnvironmentEvent,
} from './p2-candidate-offline.js';

const rain: P7EnvironmentEventDefinition = {
  eventId: 'test:ambient-rain', version: 'test-v1', eventClass: 'environment',
  actorAbsent: true, protagonistInvolved: false, causedByProtagonist: false,
  reversible: true, changesIdentity: false, changesRelationship: false, changesMoralStance: false,
  exclusiveOutcomeCount: 1, requiresPlayerChoice: false, frequency: 'low', weight: 'high',
  resourceOutputs: [
    { resourceId: 'test:stamina', resourceClass: 'renewable', quantityMicrounits: 1_000_000 },
    { resourceId: 'test:rare-token', resourceClass: 'scarce', quantityMicrounits: 1_000_000 },
  ],
  capsule: { capsuleId: 'test:rain-capsule', text: '檐角积水沿着旧痕滴落。渡口多了一只系紧的木桶。',
    perspective: 'scene', sourceNpcId: 'npc_cenjiu', impressionPrompt: '这处痕迹熟悉吗？' },
};

function rupture(ruptureId: string, priority: number, overrides: Partial<P7CausalRupture> = {}): P7CausalRupture {
  return {
    ruptureId, priority, createdAtGameMinute: 300 + priority,
    choices: [{ choiceId: 'inspect', outcomeId: `${ruptureId}:inspect` }, { choiceId: 'wait', outcomeId: `${ruptureId}:wait` }],
    releaseByChoice: { inspect: `${ruptureId}:inspect-release` },
    conservativeOutcomeId: `${ruptureId}:preserve`,
    conservativeReleaseIsReversible: true,
    conservativeReleaseChangesCharacter: false,
    conservativeReleaseRequiresChoice: false,
    ...overrides,
  };
}

function plan(minutes: number, events: readonly P7ScheduledEnvironmentEvent[] = [], ruptures: readonly P7CausalRupture[] = []) {
  return planP7OfflineCatchUp({
    saveId: 'p7-test-save', memoryMode: 'continue', checkpointId: 'checkpoint-1',
    startedAtMs: 1_000_000, returnedAtMs: 1_000_000 + minutes * 60_000,
    scheduledEvents: events, ruptures, allowlist: { [rain.eventId]: rain }, recentAuthorizedOnlineAction: true,
  });
}

describe('P7 candidate offline evolution policy', () => {
  it('pins policy values and leaves the actual event allowlist closed pending trusted-host review', () => {
    expect(Object.isFrozen(P7_CANDIDATE_POLICY)).toBe(true);
    expect(P7_CANDIDATE_POLICY).toMatchObject({
      microWindowMinutes: 15, mainWindowEndMinutes: 720, opportunityWindowEndMinutes: 2880,
      rupturePressureThreshold: 3, renewableFloorBasisPoints: 2500, scarceFloorBasisPoints: 0,
    });
    expect(Object.keys(P7_ENVIRONMENT_EVENT_ALLOWLIST)).toEqual([]);
    const noCatalog = planP7OfflineCatchUp({ saveId: 'save', memoryMode: 'continue', checkpointId: 'c1',
      startedAtMs: 0, returnedAtMs: 16 * 60_000,
      scheduledEvents: [{ eventId: rain.eventId, occurrenceId: 'occ-1', elapsedMinute: 16, repeatOrdinal: 1 }],
      ruptures: [], recentAuthorizedOnlineAction: false });
    expect(noCatalog.environmentSettlements).toEqual([]);
    expect(noCatalog.rejectedOccurrences).toEqual([{ occurrenceId: 'occ-1', reason: 'event-not-allowlisted' }]);
  });

  it('uses the four physical windows, keeps loss time moving after opportunity events stop, and ignores the first 15 minutes', () => {
    const event = (minute: number, occurrenceId = `occ-${minute}`): P7ScheduledEnvironmentEvent => ({
      eventId: rain.eventId, occurrenceId, elapsedMinute: minute, repeatOrdinal: 1,
    });
    expect(plan(15, [event(15)]).window).toBe('micro');
    expect(plan(15, [event(15)]).lossLayerElapsedMinutes).toBe(0);
    expect(plan(16, [event(16)]).window).toBe('main');
    expect(plan(720, [event(720)]).fullRateOpportunityMinutes).toBe(705);
    expect(plan(721, [event(721)]).window).toBe('long');
    expect(plan(2880, [event(2880)]).window).toBe('long');
    const pastOpportunityWindow = plan(2881, [event(2881)]);
    expect(pastOpportunityWindow.window).toBe('loss-only');
    expect(pastOpportunityWindow.environmentSettlements).toEqual([]);
    expect(pastOpportunityWindow.lossLayerElapsedMinutes).toBe(2881);
  });

  it('linearly attenuates only repeatable resource outputs by category and never attenuates capsule opportunity weight', () => {
    const repeat = (minute: number): P7ScheduledEnvironmentEvent => ({ eventId: rain.eventId,
      occurrenceId: `repeat-${minute}`, elapsedMinute: minute, repeatOrdinal: 2 });
    const atHalf = plan(1800, [repeat(1800)]);
    expect(atHalf.outputMultiplierBasisPoints).toEqual({ renewable: 6250, scarce: 5000, narrative: 10_000 });
    expect(atHalf.environmentSettlements[0]?.outputs.map(item => item.quantityMicrounits)).toEqual([625_000, 500_000]);
    expect(plan(2880).outputMultiplierBasisPoints).toMatchObject({ renewable: 2500, scarce: 0, narrative: 10_000 });
    expect(plan(2881).outputMultiplierBasisPoints).toMatchObject({ renewable: 0, scarce: 0, narrative: 10_000 });
    const firstRepeatAtFloor = plan(2880, [{ eventId: rain.eventId, occurrenceId: 'first', elapsedMinute: 2880, repeatOrdinal: 1 }]);
    expect(firstRepeatAtFloor.environmentSettlements[0]?.outputs.map(item => item.quantityMicrounits)).toEqual([1_000_000, 1_000_000]);
  });

  it('admits only listed reversible environment events without protagonist causality or branches', () => {
    const badEvents: P7EnvironmentEventDefinition[] = [
      { ...rain, eventClass: 'character' },
      { ...rain, protagonistInvolved: true },
      { ...rain, causedByProtagonist: true },
      { ...rain, reversible: false },
      { ...rain, changesIdentity: true },
      { ...rain, changesRelationship: true },
      { ...rain, changesMoralStance: true },
      { ...rain, exclusiveOutcomeCount: 2 },
      { ...rain, requiresPlayerChoice: true },
    ];
    const rejected = badEvents.map((definition, index) => planP7OfflineCatchUp({
      saveId: 'p7-test-save', memoryMode: 'continue', checkpointId: 'checkpoint-1',
      startedAtMs: 1_000_000, returnedAtMs: 1_000_000 + 60 * 60_000,
      scheduledEvents: [{ eventId: definition.eventId, occurrenceId: `bad-${index}`, elapsedMinute: 30, repeatOrdinal: 1 }],
      ruptures: [], allowlist: { [definition.eventId]: definition }, recentAuthorizedOnlineAction: false,
    }).rejectedOccurrences[0]?.reason);
    expect(rejected).toHaveLength(badEvents.length);
  });

  it('keeps long absence opportunities low-frequency and high-weight, with a stable winner per 12-hour bucket', () => {
    const second = { ...rain, eventId: 'test:other-scene' };
    const scheduled = [
      { eventId: rain.eventId, occurrenceId: 'long-1a', elapsedMinute: 800, repeatOrdinal: 2 },
      { eventId: second.eventId, occurrenceId: 'long-1b', elapsedMinute: 900, repeatOrdinal: 2 },
      { eventId: rain.eventId, occurrenceId: 'long-2', elapsedMinute: 1500, repeatOrdinal: 2 },
      { eventId: 'test:normal', occurrenceId: 'long-normal', elapsedMinute: 2200, repeatOrdinal: 2 },
    ];
    const result = planP7OfflineCatchUp({ saveId: 'save', memoryMode: 'continue', checkpointId: 'c1',
      startedAtMs: 0, returnedAtMs: 2300 * 60_000, scheduledEvents: scheduled, ruptures: [],
      allowlist: { [rain.eventId]: rain, [second.eventId]: second, 'test:normal': { ...rain, eventId: 'test:normal', weight: 'normal' } },
      recentAuthorizedOnlineAction: false });
    expect(result.environmentSettlements.map(item => item.occurrenceId)).toEqual(['long-1a', 'long-2']);
    expect(result.rejectedOccurrences.map(item => item.reason)).toContain('long-window-frequency-budget');
    expect(result.rejectedOccurrences.map(item => item.reason)).toContain('long-window-requires-low-frequency-high-weight');
  });

  it('shows at most one critical rupture and applies N=3 pressure downgrade plus conservative overflow release', () => {
    expect(planCausalReturn([]).primary).toBeNull();
    const one = planCausalReturn([rupture('r1', 1)]);
    expect(one.primary?.ruptureId).toBe('r1');
    expect(one.background).toEqual([]);
    const two = planCausalReturn([rupture('r1', 1), rupture('r2', 2)]);
    expect(two.primary?.ruptureId).toBe('r2');
    expect(two.background.map(item => item.rupture.ruptureId)).toEqual(['r1']);
    const three = planCausalReturn([rupture('r1', 1), rupture('r2', 2), rupture('r3', 3)]);
    expect(three.primary?.ruptureId).toBe('r3');
    expect(three.background.map(item => item.reason)).toEqual(['pressure-threshold', 'secondary']);
    expect(three.conservativeAutoReleases).toEqual([]);
    const four = planCausalReturn([rupture('r1', 1), rupture('r2', 2), rupture('r3', 3), rupture('r4', 4)]);
    expect(four.primary?.ruptureId).toBe('r4');
    expect(four.background.map(item => item.rupture.ruptureId)).toEqual(['r3', 'r2']);
    expect(four.conservativeAutoReleases).toEqual([{ ruptureId: 'r1', outcomeId: 'r1:preserve' }]);
    expect(() => planCausalReturn([
      rupture('r1', 1, { conservativeReleaseIsReversible: false }), rupture('r2', 2), rupture('r3', 3), rupture('r4', 4),
    ])).toThrow('P7_CONSERVATIVE_RELEASE_NOT_SAFE');
  });

  it('releases pending ruptures only through the player choice or authored conservative outcome', () => {
    const planned = planCausalReturn([rupture('main', 9), rupture('ambient', 8), rupture('overflow', 7), rupture('overflow-2', 6)]);
    expect(resolveP7CausalChoice(planned, 'inspect')).toEqual([
      { ruptureId: 'main', outcomeId: 'main:inspect', resolvedBy: 'player-choice' },
      { ruptureId: 'ambient', outcomeId: 'ambient:inspect-release', resolvedBy: 'player-choice' },
      { ruptureId: 'overflow', outcomeId: 'overflow:inspect-release', resolvedBy: 'player-choice' },
      { ruptureId: 'overflow-2', outcomeId: 'overflow-2:preserve', resolvedBy: 'conservative-pressure-release' },
    ]);
    expect(() => resolveP7CausalChoice(planned, 'invented-choice')).toThrow('P7_CAUSAL_CHOICE_NOT_AUTHORIZED');
  });

  it('validates brief capsules, isolates them by save and mode, limits display without deleting, and returns a non-branch confirmation', () => {
    const template = rain.capsule!;
    expect(() => validateP7TimeCapsuleTemplate(template)).not.toThrow();
    expect(() => validateP7TimeCapsuleTemplate({ ...template, text: '你想起了什么？' })).toThrow('P7_CAPSULE_CONTENT_INVALID');
    expect(() => validateP7TimeCapsuleTemplate({ ...template, text: '甲。乙。丙。' })).toThrow('P7_CAPSULE_CONTENT_INVALID');
    const capsule = materializeP7TimeCapsule({ saveId: 'save-1', memoryMode: 'continue', catchUpId: 'p7-c1',
      occurrenceId: 'occ-1', elapsedMinute: 60, template,
      authorizedGrant: { grantId: 'grant-1', npcId: 'npc_cenjiu' } });
    const all = [capsule, ...['2', '3', '4'].map(id => ({ ...capsule, capsuleId: id, createdAtElapsedMinute: Number(id) }))];
    const brief = buildP7ReturnBrief({ saveId: 'save-1', capsules: all, memoryMode: 'continue', accessibleGrantIds: ['grant-1'] });
    expect(brief.cards).toHaveLength(3);
    expect(brief.archivedCapsuleIds).toEqual(['2']);
    expect(buildP7ReturnBrief({ saveId: 'save-1', capsules: all, memoryMode: 'forgetting', accessibleGrantIds: [] }))
      .toMatchObject({ cards: [], skippedByMemoryPolicy: all.map(item => item.capsuleId) });
    expect(buildP7ReturnBrief({ saveId: 'other-save', capsules: all, memoryMode: 'continue', accessibleGrantIds: ['grant-1'] }).cards)
      .toEqual([]);
    expect(() => materializeP7TimeCapsule({ saveId: 'save-1', memoryMode: 'forgetting', catchUpId: 'p7-c1',
      occurrenceId: 'occ-1', elapsedMinute: 60, template,
      authorizedGrant: { grantId: 'grant-1', npcId: 'npc_shuiyuya' } })).toThrow('P7_CAPSULE_MEMORY_SCOPE_INVALID');
    expect(recordP7MicroConfirmation(capsule.capsuleId, 'affirm')).toMatchObject({
      kind: 'micro-confirmation', writesWorldState: false, impression: 'affirm',
    });
  });

  it('makes catch-up retries stable, clamps wall-clock rollback, and cools continuity without gameplay penalties', () => {
    expect(p7ElapsedMinutes(100, 90)).toBe(0);
    const frozenId = p7CatchUpId('save', 'continue', 'c1');
    expect(p7CatchUpId('save', 'continue', 'c1')).toBe(frozenId);
    expect(p7CatchUpId('save', 'continue', 'c2')).not.toBe(frozenId);
    expect(p7CatchUpId('save', 'forgetting', 'c1')).not.toBe(frozenId);
    const firstPlan = plan(24 * 60);
    const laterRetry = planP7OfflineCatchUp({ saveId: 'p7-test-save', memoryMode: 'continue', checkpointId: 'checkpoint-1',
      startedAtMs: 1_000_000, returnedAtMs: 1_000_000 + 25 * 60 * 60_000,
      scheduledEvents: [], ruptures: [], allowlist: { [rain.eventId]: rain }, recentAuthorizedOnlineAction: true });
    expect(firstPlan.catchUpId).toBe(laterRetry.catchUpId);
    expect(laterRetry.elapsedMinutes).toBeGreaterThan(firstPlan.elapsedMinutes);
    const rollback = planP7OfflineCatchUp({ saveId: 'save', memoryMode: 'continue', checkpointId: 'c1',
      startedAtMs: 100, returnedAtMs: 90, scheduledEvents: [], ruptures: [], recentAuthorizedOnlineAction: true });
    expect(rollback).toMatchObject({ elapsedMinutes: 0, window: 'micro', lossLayerElapsedMinutes: 0,
      worldTemperature: 'warm', onlineContinuityCue: true });
    const longAbsence = plan(49 * 60, [], []);
    expect(longAbsence.worldTemperature).toBe('cool');
    expect(longAbsence.onlineContinuityCue).toBe(false);
  });
});
