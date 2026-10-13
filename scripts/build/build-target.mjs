const TARGETS = new Set(['release', 'cloudflare-preview', 'test']);

/** Pages Git builds publish their output: omission must not select the local test posture. */
export function resolveWebBuildTarget(env = process.env) {
  const pages = env.CF_PAGES === '1';
  const target = env.JIUXIAO_BUILD_TARGET ?? (pages ? 'release' : 'test');
  if (!TARGETS.has(target)) {
    throw new Error(`Unknown JIUXIAO_BUILD_TARGET "${target}"; refusing to build without a recognised media-licence posture.`);
  }
  if (pages && target === 'test') {
    throw new Error('PAGES_TEST_BUILD_FORBIDDEN: Cloudflare Pages cannot publish the local test build posture.');
  }
  return target;
}
