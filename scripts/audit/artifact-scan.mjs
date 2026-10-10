import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Fail closed: shipped artifacts must never contain the unapproved scene experiment packages. */
const REPO_ROOT = resolve(import.meta.dirname, '../..');
const PATH_PATTERN = /scene-studio|scene-gate|@jiuxiao\/scene/;
const PACKAGE_NAME_NEEDLES = ['@jiuxiao/scene-gate', '@jiuxiao/scene-studio'];
const LIBRARY_NEEDLES = ['THREE.Revision', 'three.module', 'three.core'];
const CONTENT_NEEDLES = [...PACKAGE_NAME_NEEDLES, ...LIBRARY_NEEDLES];
// Known false positive: legitimate pre-PR#66 candidate media named mountain-gate.*.
// The whitelist only shields filename-level path matches; content stays scanned, and
// a mountain-gate file inside a matching directory is never shielded.
const FILENAME_WHITELIST = 'mountain-gate';

export function scanArtifacts(roots) {
  const findings = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  for (const root of roots) {
    const rootDirectory = resolve(REPO_ROOT, root);
    if (!existsSync(rootDirectory)) throw new Error(`ARTIFACT_ROOT_MISSING: ${root}`);
    const walk = (directory, prefix) => {
      const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        const relativePath = `${prefix}${entry.name}`;
        if (entry.isDirectory()) { walk(join(directory, entry.name), `${relativePath}/`); continue; }
        if (!entry.isFile()) throw new Error(`UNSCANNABLE_ARTIFACT_ENTRY: ${root}/${relativePath}`);
        const content = readFileSync(join(directory, entry.name));
        filesScanned += 1;
        bytesScanned += content.length;
        const contentHits = CONTENT_NEEDLES.filter(needle => content.includes(needle));
        let pathHit = PATH_PATTERN.test(relativePath);
        if (pathHit
          && entry.name.includes(FILENAME_WHITELIST)
          && !PACKAGE_NAME_NEEDLES.some(needle => content.includes(needle))
          && !PATH_PATTERN.test(prefix)) pathHit = false;
        if (pathHit) findings.push({ root, path: relativePath, code: 'SCENE_PACKAGE_IN_ARTIFACTS', detail: 'artifact path references the scene experiment packages' });
        if (contentHits.length > 0) findings.push({ root, path: relativePath, code: 'SCENE_CODE_IN_ARTIFACTS', detail: `content matches ${contentHits.join(', ')}` });
      }
    };
    walk(rootDirectory, '');
  }
  findings.sort((a, b) => {
    const left = `${a.root}/${a.path}/${a.code}`;
    const right = `${b.root}/${b.path}/${b.code}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { findings, filesScanned, bytesScanned };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const roots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['apps/web/dist'];
  const report = scanArtifacts(roots);
  for (const finding of report.findings) console.log(`${finding.code}: ${finding.root}/${finding.path} (${finding.detail})`);
  if (report.findings.length > 0) {
    console.error(`Artifact scan failed: ${report.findings.length} finding(s); refusing to ship the scene experiment packages.`);
    process.exitCode = 1;
  } else {
    console.log(`Artifact scan passed: ${report.filesScanned} files, ${report.bytesScanned} bytes scanned in [${roots.join(', ')}]; zero scene package or scene code hits.`);
  }
}
