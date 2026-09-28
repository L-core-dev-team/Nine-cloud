#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : 'pnpm',
  windows ? ['/d', '/s', '/c', 'pnpm licenses list --json'] : ['licenses', 'list', '--json'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (result.status !== 0) throw new Error(`pnpm licenses failed: ${result.stderr}`);
const groups = JSON.parse(result.stdout);
const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'MPL-2.0']);
const unknown = Object.entries(groups).filter(([license]) => !allowed.has(license))
  .flatMap(([license, packages]) => packages.map(({ name, versions }) => `${name}@${versions.join(',')} (${license})`));
if (unknown.length) {
  console.error('Dependencies requiring license review:\n' + unknown.join('\n'));
  process.exitCode = 1;
} else {
  const count = Object.values(groups).reduce((total, entries) => total + entries.length, 0);
  console.log(`${count} package entries checked; licenses: ${Object.keys(groups).join(', ')}`);
}
