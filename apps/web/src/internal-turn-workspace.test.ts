import { describe, expect, it } from 'vitest';
import { shouldEnableInternalTurnWorkspace } from './internal-turn-workspace';

describe('internal turn workspace gate', () => {
  it('is disabled by default and requires explicit development opt-in', () => {
    expect(shouldEnableInternalTurnWorkspace(true, undefined)).toBe(false);
    expect(shouldEnableInternalTurnWorkspace(true, 'false')).toBe(false);
    expect(shouldEnableInternalTurnWorkspace(true, 'true')).toBe(true);
  });

  it('cannot be enabled in a non-development build, even when the flag is set', () => {
    expect(shouldEnableInternalTurnWorkspace(false, 'true')).toBe(false);
  });
});
