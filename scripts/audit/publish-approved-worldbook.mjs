import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { publishApprovedWorldbook } from '../../packages/content/dist/worldbook-publisher.js';

const [candidateFile, sourceManifestFile, sourceRootArgument, outputFile] = process.argv.slice(2);
if (!candidateFile || !sourceManifestFile || !sourceRootArgument || !outputFile) {
  throw new Error('Usage: node scripts/audit/publish-approved-worldbook.mjs <approved-candidates.json> <source-manifest.json> <private-source-dir> <output.json>');
}

const candidates = JSON.parse(await readFile(resolve(candidateFile), 'utf8'));
const sourceManifest = JSON.parse(await readFile(resolve(sourceManifestFile), 'utf8'));
if (!Array.isArray(candidates?.candidates) || !Array.isArray(sourceManifest?.sources)) {
  throw new Error('Candidate and source manifest arrays are required');
}
const sourceRoot = await realpath(resolve(sourceRootArgument));
const requiredSourceIds = new Set(candidates.candidates.filter(entry => entry?.status === 'approved')
  .flatMap(entry => Array.isArray(entry.sourceIds) ? entry.sourceIds : []));
const sources = sourceManifest.sources.filter(source => requiredSourceIds.has(source.id)).map(source => ({
  id: source.id,
  sha256: source.sha256,
  readBytes: async () => {
    if (typeof source.path !== 'string' || isAbsolute(source.path)) throw new Error(`Invalid private source path: ${source.id}`);
    const path = await realpath(resolve(sourceRoot, source.path));
    const fromRoot = relative(sourceRoot, path);
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..\\`) || fromRoot.startsWith('../') || isAbsolute(fromRoot)) {
      throw new Error(`Source path escapes the private directory: ${source.id}`);
    }
    return new Uint8Array(await readFile(path));
  },
}));
const manifest = await publishApprovedWorldbook({
  canonVersion: candidates.canonVersion,
  candidates: candidates.candidates,
  sources,
});
if (!manifest.entries.length) throw new Error('No two-author-approved Canon entries to publish');
const target = resolve(outputFile);
if (target === resolve(candidateFile) || target === resolve(sourceManifestFile)) throw new Error('Output must not overwrite review inputs');
const temporary = `${target}.${process.pid}.tmp`;
try {
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, target);
} catch (error) {
  await rm(temporary, { force: true });
  throw error;
}
console.log(`Published ${manifest.entries.length} approved entries to ${target}`);
