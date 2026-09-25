import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/prepare-worldbook-final.mjs <private-review-dir>');
const reviewDir = resolve(reviewArgument);
const input = JSON.parse(await readFile(join(reviewDir, 'canon-review-registry.json'), 'utf8'));
const excludedEntryIds = new Set(['system_general', 'system_economy']);
const reasonFor = line => /⟦/.test(line) ? 'source_gap_or_uncertainty' :
  /\[看不清/.test(line) ? 'unreadable_in_source' :
  /^\s*[（(]/.test(line) ? 'editorial_note' :
  /^\s*>/.test(line) ? 'review_preface' : null;
const sourceLine = line => /^\s*【来源：/.test(line);
const cleanInlineSource = line => line.replace(/【来源：[^】]+】.*$/, '')
  .replace(/（(?:\d{3}|补\d{3})[^）]*）/g, '').trimEnd();
const endOfSentence = /[。！？；：.!?;:]$/;
const bulletOrHeading = /^[•▪○◦\-*|>]|^\d+[.、]|^#{1,6} /;
const dropped = [];
const retainedFragments = [];
const entries = [];
for (const entry of input.entries) {
  if (excludedEntryIds.has(entry.id)) continue;
  const sections = [];
  let section = { title: '概述', content: '' };
  let forceBreak = false;
  const flush = () => {
    section.content = section.content.trim();
    if (section.content) sections.push(section);
  };
  for (const raw of entry.contentDraft.split(/\r?\n/)) {
    const line = cleanInlineSource(raw).trim();
    if (!line || line === '---' || sourceLine(raw)) continue;
    const heading = /^#{3,5} (.+)$/.exec(line);
    if (heading) {
      if (reasonFor(line)) { dropped.push({ entryId: entry.id, reason: 'unreadable_heading', text: line }); continue; }
      flush();
      section = { title: heading[1].trim(), content: '' };
      forceBreak = false;
      continue;
    }
    const reason = reasonFor(line);
    let safeLine = line;
    if (reason === 'source_gap_or_uncertainty' || reason === 'unreadable_in_source') {
      safeLine = line.replace(/⟦[^⟧]+⟧|\[看不清[^\]]*\]/g, '…').replace(/…+/g, '…').trim();
      if (safeLine === '…') {
        dropped.push({ entryId: entry.id, reason, text: line });
        if (section.content.trim() && !endOfSentence.test(section.content.trim())) section.content += '…';
        forceBreak = true;
        continue;
      }
      if (/《[^》]*…[^》]*》/.test(safeLine)) {
        dropped.push({ entryId: entry.id, reason: 'unreadable_proper_name', text: line });
        forceBreak = true;
        continue;
      }
      retainedFragments.push({ entryId: entry.id, reason, original: line, publishedExcerpt: safeLine });
    } else if (reason) { dropped.push({ entryId: entry.id, reason, text: line }); continue; }
    if (line.startsWith('#')) { dropped.push({ entryId: entry.id, reason: 'stray_heading', text: line }); continue; }
    const prior = section.content.trimEnd();
    if (prior && !forceBreak && !endOfSentence.test(prior) && !bulletOrHeading.test(safeLine) && !safeLine.startsWith('|')) {
      section.content = `${prior}${safeLine}`;
    } else {
      section.content += `${section.content ? '\n' : ''}${safeLine}`;
    }
    forceBreak = false;
  }
  flush();
  if (!sections.length) { dropped.push({ entryId: entry.id, reason: 'no_recoverable_content', text: '' }); continue; }
  if (entry.id === 'system_technique_grade') {
    for (const item of sections) item.content = item.content
      .replace('共分为四大基础品阶：凡、黄、玄、地、天', '分为凡、黄、玄、地、天五阶')
      .replaceAll('拜火圣教', '圣火教');
  }
  const content = sections.map(item => item.title === '概述' ? item.content : `${item.title}\n${item.content}`).join('\n\n');
  entries.push({ id: entry.id, title: entry.title, category: entry.category,
    ...(entry.parentId ? { parentId: entry.parentId } : {}),
    status: 'confirmed', canonVersion: '1.0', content, sections,
    aliases: entry.id === 'world_jiuxiao' ? ['九霄大陆'] :
      entry.id === 'region_honghuang_yaolin' ? ['洪荒妖林', '妖之领域'] :
      entry.id === 'faction_shenghuo_jiao' ? ['拜火圣教'] : [],
    tags: [entry.title, entry.category], sourceRefs: entry.sourceRefs,
    publicSourceNote: '依据《九霄》原设截图、逐图文字及作者授权裁定整理；省略号表示原图截断或无法辨认的文字，不构成额外规则。',
    updatedAt: '2026-09-25', sortOrder: entry.sortOrder });
}
const joined = entries.map(entry => entry.content).join('\n');
if (/⟦|【来源：|\[看不清|C:[\\/]|待确认|疑似缺失/.test(joined)) {
  throw new Error('Unresolved review annotation leaked into proposed public Canon');
}
const output = { schemaVersion: 1, activeVersion: '1.0', entries, dropped, retainedFragments };
await writeFile(join(reviewDir, 'canon-final-preview.json'), `${JSON.stringify(output, null, 2)}\n`);
await writeFile(join(reviewDir, 'canon-final-reading-preview.md'), [
  '# 《九霄》世界书 Canon 1.0 阅读候选', '',
  '> 仅收录可从已有素材连续确认的正文。残缺片段详见私有缺口记录；本稿用于最终自检。', '',
  ...entries.flatMap(entry => [`## ${entry.title}`, '', ...entry.sections.flatMap(section => [
    `### ${section.title}`, '', section.content, '',
  ])]),
].join('\n'));
console.log(JSON.stringify({ entries: entries.length, dropped: dropped.length, retainedFragments: retainedFragments.length,
  originalCandidateCharacters: input.entries.reduce((sum, entry) => sum + entry.contentDraft.length, 0),
  readyCharacters: joined.length, shortest: entries.slice().sort((a, b) => a.content.length - b.content.length).slice(0, 7).map(entry => [entry.id, entry.content.length]) }, null, 2));
