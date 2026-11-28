#!/usr/bin/env node
// Secret scan of a commit range with the pinned gitleaks release (governance §5.2).
//
//   node scripts/audit/secret-scan.mjs                 # origin/main..HEAD
//   node scripts/audit/secret-scan.mjs --base <sha> --head <sha>
//   node scripts/audit/secret-scan.mjs --full          # every ref (weekly job)
//
// Fails closed: a missing or different gitleaks version, an unknown base commit or
// any finding exits non-zero. Findings are always redacted, so CI logs never carry
// the matched value; only the rule, file, line and commit are printed.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const GITLEAKS_VERSION = '8.30.1';
const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const full = args.includes('--full');
const bin = process.env.GITLEAKS_BIN || 'gitleaks';

function git(...gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function fail(message) {
  console.error(`Secret scan failed: ${message}`);
  process.exit(1);
}

const version = spawnSync(bin, ['version'], { encoding: 'utf8' });
if (version.status !== 0) fail(`gitleaks is not installed (looked for ${bin}); install the pinned ${GITLEAKS_VERSION} release.`);
if (version.stdout.trim().replace(/^v/, '') !== GITLEAKS_VERSION) {
  fail(`expected gitleaks ${GITLEAKS_VERSION}, found ${version.stdout.trim()}; the allowlist in .gitleaks.toml is reviewed against that release.`);
}

let logOpts;
let label;
if (full) {
  logOpts = '--all';
  label = 'all refs';
} else {
  const head = git('rev-parse', '--verify', `${option('--head') ?? process.env.SECRET_SCAN_HEAD ?? 'HEAD'}^{commit}`);
  if (!head) fail('head commit is not available.');
  const requestedBase = option('--base') ?? process.env.SECRET_SCAN_BASE ?? 'origin/main';
  if (!requestedBase || /^0+$/.test(requestedBase)) {
    // A newly created ref has no previous commit; scan the pushed head commit itself.
    logOpts = `-1 ${head}`;
    label = `${head.slice(0, 12)} (new ref)`;
  } else {
    const base = git('rev-parse', '--verify', `${requestedBase}^{commit}`);
    if (!base) fail(`base ${requestedBase} is not available; fetch full history (actions/checkout fetch-depth: 0).`);
    const mergeBase = git('merge-base', base, head);
    if (!mergeBase) fail(`no merge base between ${requestedBase} and ${head}.`);
    logOpts = `${mergeBase}..${head}`;
    label = `${mergeBase.slice(0, 12)}..${head.slice(0, 12)}`;
  }
}

const scan = spawnSync(bin, [
  'git', '--no-banner', '--redact', '--exit-code', '1',
  '--config', resolve(root, '.gitleaks.toml'),
  `--log-opts=${logOpts}`,
  root,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const output = `${scan.stdout}${scan.stderr}`;
process.stdout.write(output.replace(/\u001b\[[0-9;]*m/g, ''));
if (scan.status !== 0) fail(`gitleaks reported findings or an error in ${label} (exit ${scan.status}). Do not paste the value anywhere; rotate any real secret, and allowlist only a proven false positive in .gitleaks.toml with a reason.`);
console.log(`Secret scan passed: gitleaks ${GITLEAKS_VERSION} found no leaks in ${label}.`);
