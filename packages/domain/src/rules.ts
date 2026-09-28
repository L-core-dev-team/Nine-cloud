import type { ActionIntent, Decision, SaveEnvelope } from '@jiuxiao/contracts';

// S1 has no signed gameplay rule table. Reject every action explicitly until S3.
export function evaluate(_intent: ActionIntent, save: SaveEnvelope): Decision {
  return { status: 'rejected', code: 'RULES_NOT_READY',
    message: '玩法规则尚未签署，当前版本不能结算行动。', revision: save.revision };
}
