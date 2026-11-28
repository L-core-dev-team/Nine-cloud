import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
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

// ---------------------------------------------------------------------------
// Release leak scan (JX-VISION-02 governance §5.2): the public player bundle must
// not carry build-machine paths, private worldbook review material, server env
// key names or personal data. Every rule below fails closed; the only exemption
// is the reviewed allowlist file, which matches exact values and needs a reason.
// ---------------------------------------------------------------------------
export const DEFAULT_ALLOWLIST_PATH = resolve(REPO_ROOT, 'scripts/audit/artifact-scan.allowlist.json');
export const ENV_REGISTRY_FILES = ['.env.example', 'deployment/api.private.env.example'];
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.map', '.txt', '.md', '.svg', '.xml', '.webmanifest', '.csv', '.ts', '.tsx']);

// Build-machine absolute paths. Applied to every file, binary included (image
// metadata can carry them); each pattern needs several fixed characters, so
// random binary bytes do not plausibly match.
const LOCAL_PATH_PATTERNS = [
  { name: 'posix-user-home', pattern: /(?<![A-Za-z0-9._~%-])\/(?:Users|home)\/[A-Za-z0-9._-]/ },
  { name: 'windows-user-profile', pattern: /[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)/i },
  { name: 'windows-file-url', pattern: /file:\/{2,3}[A-Za-z]:[\\/]/i },
];
// Drive-letter paths such as D:\ are checked in text files only: three random
// binary bytes match them far too often to be meaningful in fonts or media.
const TEXT_LOCAL_PATH_PATTERNS = [
  { name: 'windows-drive-path', pattern: /(?<![A-Za-z0-9])[A-Za-z]:\\{1,2}(?=[A-Za-z0-9_.\u0080-\uffff])/ },
];

// Private worldbook review material (AGENTS.md: private original images, per-image
// transcriptions, local paths and review records never enter the player bundle).
// The names come from the gitignored screenshot directory and the private review
// files read by scripts/audit-worldbook-sources.mjs, prepare-worldbook-final.mjs,
// write-worldbook-author-handoff.mjs and finalize-worldbook-canon.mjs (those
// scripts were only read, never executed, to collect them).
export const PRIVATE_WORLDBOOK_NEEDLES = [
  '世界书截图',
  '编号对照.txt',
  '世界书_拼接初稿',
  '世界书_拼接修订候选',
  '拼接审核报告',
  '世界书_作者侧交接与自检',
  '章节审核矩阵',
  '设定OCR数据',
  '设定截图OCR汇编',
  'canon-review-registry',
  'canon-final-preview',
  'canon-final-reading-preview',
  'legacy-182-review-ledger',
  'source-audit.json',
  'source-registry.json',
  'text-coverage.json',
  'author-decisions.json',
  'review-flags.json',
  'canon-conflicts.json',
  // Private registry fields that the public runtime strips (scripts/build-canon-runtime.mjs).
  'sourceRefs',
  'resolvedSourceGaps',
  'imageSha256',
  'textSha256',
];
const PRIVATE_WORLDBOOK_PATTERNS = [/(?:原|补)\d{3}\.(?:png|txt)/];

const EMAIL_PATTERN = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;
// Mainland mobile numbers, bare or with +86 / 0086, optionally separated.
const PHONE_PATTERN = /(?<![0-9A-Za-z])(?:(?:\+|00)86[- ]?)?1[3-9]\d(?:[- ]?\d{4}){2}(?![0-9])/g;
const VITE_KEY_PATTERN = /\bVITE_[A-Z0-9_]+\b/g;
const SECRET_KEY_PATTERN = /\b[A-Z][A-Z0-9]*_(?:SECRET(?:_KEY|_ID)?|PASSWORD|PASSWD|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN)\b/g;

/** Key names declared in the committed env examples (values are never read). */
export function readEnvRegistry(files = ENV_REGISTRY_FILES) {
  const keys = new Set();
  for (const file of files) {
    const path = resolve(REPO_ROOT, file);
    if (!existsSync(path)) throw new Error(`ENV_REGISTRY_MISSING: ${file}`);
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
      if (match) keys.add(match[1]);
    }
  }
  return keys;
}

export function loadAllowlist(path = DEFAULT_ALLOWLIST_PATH) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.schemaVersion !== 1) throw new Error('ARTIFACT_ALLOWLIST_SCHEMA: expected schemaVersion 1');
  const section = name => {
    const entries = raw[name] ?? [];
    if (!Array.isArray(entries)) throw new Error(`ARTIFACT_ALLOWLIST_SCHEMA: ${name} must be an array`);
    for (const entry of entries) {
      if (typeof entry?.value !== 'string' || !entry.value || typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
        throw new Error(`ARTIFACT_ALLOWLIST_SCHEMA: every ${name} entry needs a value and a reason`);
      }
    }
    return entries;
  };
  return {
    emails: new Set(section('emails').map(entry => entry.value.toLowerCase())),
    phones: new Set(section('phones').map(entry => normalizePhone(entry.value))),
    envKeys: new Set(section('envKeys').map(entry => entry.value)),
  };
}

function normalizePhone(value) {
  return value.replace(/\D/g, '').replace(/^(?:0086|86)(?=1[3-9]\d{9}$)/, '');
}

// Findings never echo full personal data into CI logs.
function maskEmail(value) {
  const [local, domain] = value.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function maskPhone(value) {
  const digits = normalizePhone(value);
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

function isTextArtifact(name) {
  const extension = extname(name).toLowerCase();
  return extension === '' || name.startsWith('_') || TEXT_EXTENSIONS.has(extension);
}

function scanLeaks(name, content, context, push) {
  const latin = content.toString('latin1');
  for (const { name: rule, pattern } of LOCAL_PATH_PATTERNS) {
    if (pattern.test(latin)) push('LOCAL_PATH_IN_ARTIFACTS', `matches ${rule}`);
  }
  for (const needle of PRIVATE_WORLDBOOK_NEEDLES) {
    if (content.includes(needle)) push('PRIVATE_WORLDBOOK_IN_ARTIFACTS', `contains private review name ${needle}`);
  }
  if (!isTextArtifact(name)) return;
  const text = content.toString('utf8');
  for (const { name: rule, pattern } of TEXT_LOCAL_PATH_PATTERNS) {
    if (pattern.test(text)) push('LOCAL_PATH_IN_ARTIFACTS', `matches ${rule}`);
  }
  for (const pattern of PRIVATE_WORLDBOOK_PATTERNS) {
    if (pattern.test(text)) push('PRIVATE_WORLDBOOK_IN_ARTIFACTS', 'contains a private original/supplement image or transcription file name');
  }
  const envHits = new Set();
  for (const key of context.serverEnvKeys) {
    if (!context.allowlist.envKeys.has(key) && new RegExp(`\\b${key}\\b`).test(text)) envHits.add(key);
  }
  for (const pattern of [VITE_KEY_PATTERN, SECRET_KEY_PATTERN]) {
    for (const match of text.matchAll(pattern)) if (!context.allowlist.envKeys.has(match[0])) envHits.add(match[0]);
  }
  if (envHits.size > 0) push('ENV_KEY_IN_ARTIFACTS', `unregistered env key name(s) ${[...envHits].sort().join(', ')}`);
  const emails = new Set();
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const value = match[0].toLowerCase();
    if (context.allowlist.emails.has(value)) context.allowlisted.add(`email:${value}`);
    else emails.add(maskEmail(value));
  }
  if (emails.size > 0) push('PII_EMAIL_IN_ARTIFACTS', `email address(es) ${[...emails].sort().join(', ')}`);
  const phones = new Set();
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const value = normalizePhone(match[0]);
    if (context.allowlist.phones.has(value)) context.allowlisted.add(`phone:${value}`);
    else phones.add(maskPhone(value));
  }
  if (phones.size > 0) push('PII_PHONE_IN_ARTIFACTS', `phone number(s) ${[...phones].sort().join(', ')}`);
}

export function scanArtifacts(roots, options = {}) {
  const allowlist = options.allowlist ?? loadAllowlist(options.allowlistPath);
  const registeredEnvKeys = options.envKeys ?? readEnvRegistry();
  const context = {
    allowlist,
    serverEnvKeys: [...registeredEnvKeys].filter(key => !key.startsWith('VITE_')).sort(),
    allowlisted: new Set(),
  };
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
        scanLeaks(entry.name, content, context, (code, detail) => findings.push({ root, path: relativePath, code, detail }));
      }
    };
    walk(rootDirectory, '');
  }
  findings.sort((a, b) => {
    const left = `${a.root}/${a.path}/${a.code}/${a.detail}`;
    const right = `${b.root}/${b.path}/${b.code}/${b.detail}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { findings, filesScanned, bytesScanned, allowlisted: [...context.allowlisted].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const roots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['apps/web/dist'];
  const report = scanArtifacts(roots);
  for (const finding of report.findings) console.log(`${finding.code}: ${finding.root}/${finding.path} (${finding.detail})`);
  if (report.findings.length > 0) {
    console.error(`Artifact scan failed: ${report.findings.length} finding(s); refusing to ship scene experiment packages, local paths, private worldbook material, env key names or personal data.`);
    process.exitCode = 1;
  } else {
    console.log(`Artifact scan passed: ${report.filesScanned} files, ${report.bytesScanned} bytes scanned in [${roots.join(', ')}]; zero scene package or scene code hits; zero local path, private worldbook, env key or PII hits (${report.allowlisted.length} reviewed allowlist value(s) present).`);
  }
}
