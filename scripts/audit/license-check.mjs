#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Pure policy (exported so it can be unit-tested without spawning pnpm).
// ---------------------------------------------------------------------------

// Licenses we accept for every dependency without further review.
const allowed = new Set([
  'MIT',        // Permissive, no obligations beyond attribution.
  'MIT-0',      // Nodemailer 10 ships the MIT No Attribution license, reviewed in its package LICENSE.
  'Apache-2.0', // Permissive, includes an explicit patent grant.
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',    // Weak copyleft, file-level only; satisfied by shipping the module unmodified.
  'CC0-1.0',    // Public-domain dedication; imposes no conditions (no attribution required).
  'Unlicense',  // Public-domain dedication.
  '0BSD',       // Permissive, zero-clause BSD.
  'BlueOak-1.0.0', // Permissive, OSI-approved.
  'Python-2.0', // Permissive, OSI-approved.
  'CC-BY-4.0',  // Attribution only; acceptable for build-time data.
]);

// Evaluate an SPDX licence expression. Only `OR` is resolved here: the package
// is usable if ANY `OR` branch is permissive. `AND` expressions never resolve
// to "acceptable" on their own, so they must be individually reviewed below.
export const acceptableSpdxExpression = (expression) => {
  if (typeof expression !== 'string') return false;
  const orBranches = expression.split(/\s+OR\s+/u).map((branch) => branch.trim());
  if (orBranches.length > 1) {
    return orBranches.some((branch) => acceptableSpdxExpression(branch));
  }
  const normalized = expression.replace(/^\(|\)$/gu, '').trim();
  return allowed.has(normalized);
};

// Package-specific exemptions. Each entry MUST cite where the licence was
// verified so a future reviewer can re-confirm it without re-deriving the call.
// Keep this list as small as possible; prefer evidence over convenience.
export const reviewedPackages = new Map([
  // @cloudflare/kv-asset-handler declares "MIT OR Apache-2.0" in package.json
  // and ships README.md; both branches are permissive. Reviewed 2026-10-08.
  ['@cloudflare/kv-asset-handler', { license: 'MIT OR Apache-2.0', evidence: 'package.json license field; both branches permissive' }],
  // @cloudflare/unenv-preset declares "MIT OR Apache-2.0" in package.json.
  // Reviewed 2026-10-08.
  ['@cloudflare/unenv-preset', { license: 'MIT OR Apache-2.0', evidence: 'package.json license field; both branches permissive' }],
  // wrangler declares "MIT OR Apache-2.0" in package.json. Build/deploy tooling
  // only, never shipped to players. Reviewed 2026-10-08.
  ['wrangler', { license: 'MIT OR Apache-2.0', evidence: 'package.json license field; devDependency only' }],
  // @speed-highlight/core ships a verbatim CC0-1.0 LICENSE file at the package
  // root. CC0 is a public-domain dedication with no conditions. Reviewed 2026-10-08.
  ['@speed-highlight/core', { license: 'CC0-1.0', evidence: 'LICENSE file in package root is CC0 1.0 Universal' }],
  // @img/sharp-libvips-linux-x64 is the prebuilt libvips shared library that
  // sharp loads at runtime. libvips is LGPL-3.0-or-later; sharp itself is
  // Apache-2.0. The LGPL obligation is satisfied because we consume libvips as
  // an unmodified, dynamically linked shared object and never statically embed
  // or modify it. This entry appears because the lockfile records every
  // platform's optional binary; the Linux build is only installed on Linux
  // runners. Reviewed 2026-10-08.
  ['@img/sharp-libvips-linux-x64', { license: 'LGPL-3.0-or-later', evidence: 'libvips prebuilt; dynamically linked, unmodified, replaceable by the end user' }],
  // @img/sharp-win32-x64 is the Windows x64 prebuilt sharp binary. It is
  // dual-licensed "Apache-2.0 AND LGPL-3.0-or-later" and ships a prebuilt,
  // UNMODIFIED libvips-42.dll plus a thin sharp N-API shim. LGPL-3.0 is
  // satisfied under the dynamic-linking / aggregation route: we ship libvips
  // as a separate shared library, never statically embed or modify it, and the
  // end user can replace that DLL. sharp itself remains Apache-2.0. Reviewed
  // 2026-10-08 against the package LICENSE file and lib/ contents.
  ['@img/sharp-win32-x64', { license: 'Apache-2.0 AND LGPL-3.0-or-later', evidence: 'prebuilt unmodified libvips DLL, dynamically linked; LGPL satisfied via aggregation' }],
]);

// A package passes when either:
//  1. its licence is a plain permissive one we allow outright (or an OR
//     expression with at least one permissive branch), or
//  2. it is explicitly listed in `reviewedPackages` with the SAME licence
//     string the registry reports.
// Condition 2 is the only route for copyleft (LGPL) and for AND expressions,
// so an unreviewed copyleft dependency always fails the gate. Pinning the exact
// licence string also means a silent licence CHANGE still fails.
export const isReviewed = (name, license) => {
  const reviewed = reviewedPackages.get(name);
  return Boolean(reviewed && reviewed.license === license);
};

export const findUnreviewed = (groups) => Object.entries(groups)
  .flatMap(([license, packages]) => packages
    .filter(({ name }) => !acceptableSpdxExpression(license) && !isReviewed(name, license))
    .map(({ name, versions }) => `${name}@${versions.join(',')} (${license})`));

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const run = () => {
  const windows = process.platform === 'win32';
  const result = spawnSync(windows ? 'cmd.exe' : 'pnpm',
    windows ? ['/d', '/s', '/c', 'pnpm licenses list --json'] : ['licenses', 'list', '--json'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`pnpm licenses failed: ${result.stderr}`);
  const groups = JSON.parse(result.stdout);

  const unknown = findUnreviewed(groups);
  if (unknown.length) {
    console.error('Dependencies requiring license review:\n' + unknown.join('\n'));
    process.exitCode = 1;
  } else {
    const count = Object.values(groups).reduce((total, entries) => total + entries.length, 0);
    console.log(`${count} package entries checked; ${reviewedPackages.size} individually reviewed; licenses: ${Object.keys(groups).join(', ')}`);
  }
};

// Only run the CLI when invoked directly (not when imported by the test file).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  run();
}

