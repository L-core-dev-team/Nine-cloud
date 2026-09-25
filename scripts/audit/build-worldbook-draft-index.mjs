#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const sourceRelative = 'docs/sources/世界书_保守补全版.md';
const indexRelative = 'docs/sources/worldbook-draft-index.json';
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) {
  throw new Error('Use --write to refresh the draft index or --check to verify it.');
}

const sourceBytes = readFileSync(resolve(root, sourceRelative));
const sourceText = sourceBytes.toString('utf8');
const lines = sourceText.split(/\r?\n/);
const headings = [];
for (let index = 0; index < lines.length; index += 1) {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index]);
  if (match) headings.push({ level: match[1].length, title: match[2].trim(), line: index + 1 });
}

const sections = headings.map((heading, index) => {
  const nextHeading = headings[index + 1];
  const contentEndLine = nextHeading ? nextHeading.line - 1 : lines.length;
  let endLine = lines.length;
  for (let next = index + 1; next < headings.length; next += 1) {
    if (headings[next].level <= heading.level) {
      endLine = headings[next].line - 1;
      break;
    }
  }
  const parentIndex = findParentIndex(headings, index);
  const body = lines.slice(heading.line, contentEndLine);
  const bodyText = body.join('\n');
  const sourceRefs = [...bodyText.matchAll(/【来源：([^】]+)】/gu)].map(match => match[1].trim());
  const uniqueSourceRefs = [...new Set(sourceRefs)];
  return {
    id: `draft-heading-${String(index + 1).padStart(4, '0')}`,
    parentId: parentIndex >= 0 ? `draft-heading-${String(parentIndex + 1).padStart(4, '0')}` : null,
    title: heading.title,
    level: heading.level,
    startLine: heading.line,
    contentEndLine,
    endLine,
    sourceMarkerOccurrences: sourceRefs.length,
    sourceRefs: uniqueSourceRefs,
    reviewMarkers: {
      suspectedMissing: count(bodyText, /⟦疑似缺失：/gu),
      confirmationNeeded: count(bodyText, /⟦待确认：/gu),
      unreadable: count(bodyText, /\[看不清/gu),
      unassigned: count(bodyText, /【待归属】/gu),
    },
  };
});

const summary = {
  schemaVersion: 1,
  artifact: 'author-only-worldbook-draft-index',
  handling: 'Source headings and line references only. Draft ids are index-local ordinals, not durable Canon ids. This is not reviewed Canon and is excluded from the player build.',
  source: {
    repoPath: sourceRelative,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    byteLength: sourceBytes.byteLength,
    lineCount: lines.length,
    status: 'unreviewed-source-material',
    publishable: false,
  },
  scan: {
    headingCount: headings.length,
    sourceMarkerOccurrences: count(sourceText, /【来源：[^】]+】/gu),
    reviewMarkerOccurrences: {
      suspectedMissing: count(sourceText, /⟦疑似缺失：/gu),
      confirmationNeeded: count(sourceText, /⟦待确认：/gu),
      unreadable: count(sourceText, /\[看不清/gu),
      unassigned: count(sourceText, /【待归属】/gu),
    },
    note: 'Marker counts are text occurrences, not independent issues, reviewed images, or approved entries.',
  },
  sections,
};
const output = `${JSON.stringify(summary, null, 2)}\n`;
const indexPath = resolve(root, indexRelative);

if (mode === '--write') {
  writeFileSync(indexPath, output, 'utf8');
  console.log(`Wrote ${sections.length} draft headings for SHA-256 ${summary.source.sha256}.`);
} else {
  const existing = readFileSync(indexPath, 'utf8');
  if (existing !== output) throw new Error(`${indexRelative} is stale; run pnpm worldbook:index:write.`);
  console.log(`Verified ${sections.length} draft headings for SHA-256 ${summary.source.sha256}.`);
}

function count(text, expression) {
  return [...text.matchAll(expression)].length;
}

function findParentIndex(allHeadings, currentIndex) {
  const current = allHeadings[currentIndex];
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (allHeadings[index].level < current.level) return index;
  }
  return -1;
}
