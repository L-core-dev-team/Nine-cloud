import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

// The reviewed bundle (format marker + file list) lives in a JSON manifest so
// the digest script and the API regression test share one definition and cannot
// drift apart. See that file for why pnpm-lock.yaml is intentionally excluded:
// dependency maintenance must not invalidate the author-approved rule identity.
const manifestPath = resolve(root, 'scripts/p1-rule-candidate-bundle.files.json');
const definition = JSON.parse(readFileSync(manifestPath, 'utf8'));
const format = definition.format;
const files = [...definition.files].sort();

const manifest = files.map(path => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
const digestInput = `${format}\n${manifest.map(({ path, sha256 }) => `${path}\0${sha256}`).join('\n')}\n`;
const sha256 = createHash('sha256').update(digestInput, 'utf8').digest('hex');

process.stdout.write(`${JSON.stringify({ format, sha256, files: manifest }, null, 2)}\n`);
