import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/prepare-worldbook-final.mjs <private-review-dir>');
const reviewDir = resolve(reviewArgument);
const input = JSON.parse(await readFile(join(reviewDir, 'canon-review-registry.json'), 'utf8'));
// The two foundation pages precede the named cultivation chapters in the source
// manuscript. They have no reliable original section title, but contain rules
// that must not disappear merely because the outline heading was cropped.
const manuscript = await readFile(join(reviewDir, '世界书_拼接修订候选.md'), 'utf8');
const foundationStart = manuscript.indexOf('## 【待归属】修仙基础引言（标题缺失）');
const foundationEnd = manuscript.indexOf('## 常见修炼流派', foundationStart);
if (foundationStart < 0 || foundationEnd < 0) throw new Error('Original 060/061 foundation section was not found');
input.entries.push({
  id: 'system_foundations', title: '修仙基础', category: 'cultivation_system',
  sourceRefs: ['original_060', 'original_061'], sortOrder: 235,
  contentDraft: manuscript.slice(foundationStart + '## 【待归属】修仙基础引言（标题缺失）'.length, foundationEnd),
});
const excludedEntryIds = new Set(['system_general', 'system_economy']);
const reasonFor = line => /^\s*[（(]/.test(line) ? 'editorial_note' :
  /^\s*>/.test(line) ? 'review_preface' :
  /⟦/.test(line) ? 'source_gap_or_uncertainty' :
  /\[看不清/.test(line) ? 'unreadable_in_source' : null;
const sourceLine = line => /^\s*【来源：/.test(line);
const cleanInlineSource = line => line
  .replace('如同【来源：173】支完整', '如同一支完整')
  .replace('一套【来源：165】可通过', '……可通过')
  .replace(/【来源：[^】]+】/g, '')
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
      section = { title: heading[1].includes('小节标题缺失') ? '邪修势力' : heading[1].trim(), content: '' };
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
  if (entry.id === 'faction_tiangong_ge') {
    // 原051、原052和补005是同一等级表的三种措辞；作者已裁定
    // “宗师”与“大宗师”为同级。保留各页能够确认的不同细节。
    const ranks = sections.find(item => item.title === '弟子与匠师等级');
    if (!ranks) throw new Error('The Tiangong artisan-rank section is missing');
    ranks.content = [
      '▪ 学徒：负责材料的初级处理、看守炉火、矿石分拣、熔炼和图纸描摹等杂务，同时学习基础的炼器理论，修习黄阶功法《引火锻体诀》。成功炼制出第一件入阶法器后，方可晋升。',
      '▪ 工匠：能够独立完成黄阶法器的炼制，是宗门的中坚力量。可选择三大流派之一深入研究，并有资格进入“万卷阁”学习玄阶炼器图谱。',
      '▪ 大师：技艺高超，能炼制玄阶法宝，其中有能炼制玄阶上品者。他们负责宗门项目，可开设自己的工坊，招收工匠与学徒，带领团队承接大型项目，并有资格修习三大流派的地阶功法。',
      '▪ 大宗师：炼器水平出神入化，每一位都能炼制地阶法器。他们是三大流派的执掌者，或为宗门长老，拥有仅次于阁主的地位与权力。三大院的执掌者各自在所长领域登峰造极，一件作品便能引得无数大能争抢。',
    ].join('\n');
    if (!entry.sourceRefs.includes('supplement_005')) entry.sourceRefs.push('supplement_005');
  }
  const content = sections.map(item => item.title === '概述' ? item.content : `${item.title}\n${item.content}`).join('\n\n');
  entries.push({ id: entry.id, title: entry.title, category: entry.category,
    ...(entry.parentId && !excludedEntryIds.has(entry.parentId) ? { parentId: entry.parentId } : {}),
    status: 'confirmed', canonVersion: '1.0', content, sections,
    aliases: entry.id === 'world_jiuxiao' ? ['九霄大陆'] :
      entry.id === 'region_honghuang_yaolin' ? ['洪荒妖林', '妖之领域'] :
      entry.id === 'faction_shenghuo_jiao' ? ['拜火圣教'] : [],
    tags: [entry.title, entry.category], sourceRefs: entry.sourceRefs,
    publicSourceNote: '依据《九霄》原设截图、逐图文字及作者授权裁定整理；省略号表示原图截断或无法辨认的文字，不构成额外规则；描述性小标题不代表原图标题。',
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
