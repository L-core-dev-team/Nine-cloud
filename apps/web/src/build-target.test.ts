import { describe, expect, it } from 'vitest';
import { resolveWebBuildTarget } from '../../../scripts/build/build-target.mjs';

describe('web publication posture', () => {
  it('retains the local test build and explicitly approved preview packaging', () => {
    expect(resolveWebBuildTarget({})).toBe('test');
    expect(resolveWebBuildTarget({ JIUXIAO_BUILD_TARGET: 'cloudflare-preview' })).toBe('cloudflare-preview');
  });
  it('defaults Cloudflare Git builds to the licensed release gate', () => {
    expect(resolveWebBuildTarget({ CF_PAGES: '1' })).toBe('release');
    expect(resolveWebBuildTarget({ CF_PAGES: '1', JIUXIAO_BUILD_TARGET: 'release' })).toBe('release');
  });
  it('rejects attempts to publish a test bundle on Pages', () => {
    expect(() => resolveWebBuildTarget({ CF_PAGES: '1', JIUXIAO_BUILD_TARGET: 'test' })).toThrow('PAGES_TEST_BUILD_FORBIDDEN');
  });
  it.each(['relese', '', 'staging'])('rejects unknown targets including %s', target => {
    expect(() => resolveWebBuildTarget({ JIUXIAO_BUILD_TARGET: target })).toThrow('Unknown JIUXIAO_BUILD_TARGET');
  });
});
