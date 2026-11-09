import { describe, expect, it } from 'vitest';
import {
  createP2CandidateExtractiveDigestAdapter,
  type P2CandidateDigestSource,
} from './p2-candidate-digest-queue.js';

const source = (index: number): P2CandidateDigestSource => ({
  sourceId: `receipt:save:${index}`,
  eventIds: [`event-${index}`],
  saveId: 'save',
  branchId: 'root',
  memoryMode: 'continue',
  revision: index,
  visibility: 'player-visible',
  authorization: 'committed-player-receipt',
  text: `第${index}回，岑九处理了渡口的落石。后来天色转暗。`,
});

describe('P6 candidate extractive digest adapter', () => {
  it('selects a bounded set of player-visible source excerpts with stable citations and zero cost', async () => {
    const adapter = createP2CandidateExtractiveDigestAdapter();
    const sources = Array.from({ length: 10 }, (_, index) => source(index + 1));
    const result = await adapter.build({
      job: {} as never,
      sources,
      idempotencyKey: 'candidate-job',
    });
    expect(result.sourceIds).toEqual(sources.slice(-8).map(item => item.sourceId));
    expect(result.summary).toContain('第3回，岑九处理了渡口的落石。');
    expect(result.summary).not.toContain('后来天色转暗');
    expect(result.billedCostMicros).toBe(0);
    expect(adapter.quoteMaxCostMicros({} as never)).toBe(0);
  });
});
