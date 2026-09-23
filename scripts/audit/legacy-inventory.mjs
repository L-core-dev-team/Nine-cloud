#!/usr/bin/env node
// Read-only baseline inventory. It does not copy the private legacy HTML or save data.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name} <path>`);
  return resolve(args[index + 1]);
};
const legacyPath = option('--legacy');
const currentPath = option('--current');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function readEvidence(path) {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: sha256(bytes), text: bytes.toString('utf8').replace(/^\uFEFF/, '') };
}

function attributes(tag) {
  const out = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }
  return out;
}

function plain(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim().slice(0, 100);
}

function inspectHtml(text) {
  const markup = text.replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  const controls = [];
  for (const match of markup.matchAll(/<(button|a)\b([^>]*)>([^]*?)<\/\1\s*>/gi)) {
    const attr = attributes(match[2]);
    controls.push({ tag: match[1].toLowerCase(), id: attr.id ?? null,
      label: plain(match[3]), href: attr.href ?? null,
      page: attr['data-page'] ?? null, jump: attr['data-jump'] ?? null });
  }
  const fields = [];
  for (const match of markup.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attr = attributes(match[2]);
    if (attr.id || attr.name) fields.push({ tag: match[1].toLowerCase(),
      id: attr.id ?? null, name: attr.name ?? null, type: attr.type ?? null });
  }
  const sections = [...markup.matchAll(/<section\b([^>]*)>/gi)]
    .map((match) => attributes(match[1]).id).filter(Boolean);
  return { sections, controls, fields };
}

function storageInventory(text) {
  const expressions = new Set();
  for (const match of text.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*([^,)\n]+)/g)) {
    expressions.add(match[1].trim().slice(0, 90));
  }
  const store = text.match(/\bconst STORE\s*=\s*['"]([^'"]+)['"]/);
  return { libraryKey: store?.[1] ?? null, expressions: [...expressions].sort() };
}

const legacy = readEvidence(legacyPath);
const current = readEvidence(currentPath);
const sources = [
  'work/v1.js', 'work/jx-motion.js', 'work/ai-provider.js',
  'work/ai-settings.js', 'work/legacy-migration.js', 'work/save-validation.js',
  'work/build_v1.py', 'work/build_worldbook_ui.py',
];
const sourceHashes = Object.fromEntries(sources.map((name) => {
  const evidence = readEvidence(resolve(root, name));
  return [name, { bytes: evidence.bytes, sha256: evidence.sha256 }];
}));
const report = {
  schemaVersion: 1,
  note: 'Static inventory only. Visibility, click behavior and save recovery need browser checks.',
  legacy: { path: legacy.path, bytes: legacy.bytes, sha256: legacy.sha256,
    ...inspectHtml(legacy.text), storage: storageInventory(legacy.text),
    markers: { qingyuPreset: legacy.text.includes('青鱼推荐配置') } },
  current: { path: current.path, bytes: current.bytes, sha256: current.sha256,
    ...inspectHtml(current.text), storage: storageInventory(current.text),
    markers: { qingyuPreset: current.text.includes('青鱼推荐配置'),
      renamedPreset: current.text.includes('君煜推荐配置') } },
  sourceHashes,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
