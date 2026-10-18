import { describe, expect, it } from 'vitest';
import type { SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { buildGameplayBrief, textForClarificationCandidate } from './gameplay-brief';

const save: SaveEnvelope = {
  schemaVersion: 1, saveId: 'brief-fixture', revision: 0,
  canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture',
  state: { playerId: 'player', locationId: 'loc_luhuadu', elapsedMinutes: 0, facts: { gameMinute: 0 } },
};

describe('gameplay brief', () => {
  it('derives the next hook only from current server suggestions and never implies offline progress', () => {
    const action = { id: 'observe:obj_ferry:scan', kind: 'observe', label: '观察渡船', text: '观察渡船' };
    expect(buildGameplayBrief(save, null, [action])).toEqual({
      currentLocation: '芦花渡', lastStop: '芦花渡', recentRecord: '尚无已提交行动记录。',
      nextAction: action, questStatus: '首段任务状态尚未记录。',
      offlineProgress: '本段没有离线模拟事件；游戏时间只随已提交行动变化。',
    });
  });

  it('summarizes only committed receipt events and reports the persisted first-task state', () => {
    const taskSave = { ...save, state: { ...save.state, facts: { questState: { status: 'completed', rewardClaimed: false } } } };
    const receipt = {
      saveId: save.saveId,
      idempotencyKey: 'turn-2',
      requestFingerprint: `sha256:v1:${'b'.repeat(64)}`,
      resultingRevision: 2,
      decision: {
        status: 'accepted', outcome: 'success', nextRevision: 2, events: [
          { id: 'event-1', saveId: save.saveId, branchId: 'root', type: 'quest.completed',
            payload: {}, beforeRevision: 1, afterRevision: 2, source: 'RULES' },
        ],
      },
    } as unknown as TurnReceipt;

    expect(buildGameplayBrief(taskSave, receipt, []).recentRecord).toBe('修订 2 已提交：首段任务已完成。');
    expect(buildGameplayBrief(taskSave, receipt, []).questStatus).toBe('首段任务已完成，奖励尚未领取。');
  });

  it('does not claim a world change for a clarification receipt', () => {
    const receipt = {
      saveId: save.saveId, idempotencyKey: 'turn-1', requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
      resultingRevision: 0,
      decision: { status: 'clarify', question: '你想做什么？', missingSlots: ['action'], candidates: [], interactionId: 'turn-1', revision: 0 },
    } as TurnReceipt;
    expect(buildGameplayBrief(save, receipt, []).recentRecord).toBe('最近一次输入需要补充信息；没有写入规则事件。');
  });

  it('fills the editor with the matching visible action for an ambiguous candidate', () => {
    const action = { id: 'move:loc_wangqitai', kind: 'move', label: '前往望气台', text: '去望气台' };
    expect(textForClarificationCandidate({ kind: 'move', label: '去望气台', slots: { destinationId: 'loc_wangqitai' } }, [action]))
      .toBe('去望气台');
  });
});
