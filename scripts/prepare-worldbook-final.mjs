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
  .replace(/（经看原图确认：[^）]*）/g, '')
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
        if (section.content.trim() && !endOfSentence.test(section.content.trim()) &&
          !section.content.trimEnd().endsWith('|')) section.content += '…';
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
    if (prior && !forceBreak && !endOfSentence.test(prior) && !prior.endsWith('|') &&
      !bulletOrHeading.test(safeLine) && !safeLine.startsWith('|')) {
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
    const heaven = sections.find(item => item.title === '天阶功法');
    const overlap = '这是通往合体境乃至…\n毁天灭地之威。这是通往合体境乃至更高境界的唯一钥匙。';
    if (!heaven || !heaven.content.includes(overlap)) {
      throw new Error('The overlapping 天阶功法 crops changed; review originals 091/092');
    }
    heaven.content = heaven.content.replace(overlap, '这是通往合体境乃至更高境界的唯一钥匙。');
  }
  if (entry.id === 'system_cultivation_realm') {
    const jiedan = sections.find(item => item.title === '结丹期');
    const overreached = '…将气态灵力压缩为液态灵力，通过九死一生的过程';
    if (!jiedan || !jiedan.content.startsWith(overreached)) {
      throw new Error('The disputed cropped Jiedan opening changed; review the source image');
    }
    // 原077页顶只露出“态灵力”，旧转写却补成筑基期的气态→液态
    // 过程；结丹期可确认的突破段写液态→固态，此处不猜被裁文字。
    jiedan.content = jiedan.content.replace(overreached, '…通过九死一生的过程');
  }
  if (entry.id === 'faction_haotian_jianzong') {
    const disciplesIndex = sections.findIndex(item => item.title === '弟子等级');
    const disciples = sections[disciplesIndex];
    const orphan = '\n宗门最高权力中心。\n';
    if (disciplesIndex < 0 || !disciples.content.includes(orphan)) {
      throw new Error('The cropped Haotian organization boundary changed');
    }
    const [discipleText, organizationText] = disciples.content.split(orphan);
    disciples.content = discipleText;
    sections.splice(disciplesIndex + 1, 0, { title: '组织架构', content: organizationText });
    dropped.push({ entryId: entry.id, reason: 'orphan_fragment_unattributed', text: '宗门最高权力中心。' });
  }
  for (const [id, title, fragment, replacement] of [
    ['faction_yuqing_ge', '核心总纲', '\n…和力。\n', '\n'],
    ['faction_sihai_shanghui', '组织架构', '\n量。成员', '\n成员'],
    ['faction_jixia_xuegong', '组织架构', '\n非。\n', '\n'],
  ]) {
    if (entry.id !== id) continue;
    const section = sections.find(item => item.title === title);
    if (!section || !section.content.includes(fragment)) {
      throw new Error(`The cropped orphan fragment changed: ${id}`);
    }
    section.content = section.content.replace(fragment, replacement);
    dropped.push({ entryId: id, reason: 'orphan_fragment_unattributed', text: fragment.trim() });
  }
  if (entry.id === 'faction_yuqing_ge') {
    const branches = sections.find(item => item.title === '主要分支（地阶功法）');
    const style = '▪ 风格： 护道奇术。玉清阁弟子不擅争斗';
    if (!branches || !branches.content.includes(style) || branches.content.includes('《万化丹尘》')) {
      throw new Error('The cropped 玉清阁 technique line changed; review original 016');
    }
    // The full-size source screenshot c5247208… clearly shows 《万化丹尘》.
    // The supplied TXT's “万[看不清1字]丹王” is a transcription error.
    branches.content = branches.content.replace(style,
      `▪ 《万化丹尘》 - 地阶中品\n${style}`);
    const droppedNameIndex = dropped.findIndex(item => item.entryId === entry.id &&
      item.reason === 'unreadable_proper_name' && item.text.includes('万[看不清1字]丹王'));
    if (droppedNameIndex < 0) throw new Error('The disputed 玉清阁 name record changed');
    dropped.splice(droppedNameIndex, 1);
  }
  if (entry.id === 'faction_bingshen_gong') {
    const structureIndex = sections.findIndex(item => item.title === '内部结构');
    const structure = sections[structureIndex];
    const atmosphereBreak = '\n北境之雪，清冷而孤傲。';
    if (structureIndex < 0 || !structure.content.includes(atmosphereBreak)) {
      throw new Error('The cropped Bingshen atmosphere boundary changed');
    }
    const [structureText, atmosphereText] = structure.content.split(atmosphereBreak);
    structure.content = structureText;
    sections.splice(structureIndex + 1, 0, {
      title: '门内风气', content: `…北境之雪，清冷而孤傲。${atmosphereText}`,
    });
  }
  if (entry.id === 'faction_wanshou_shanzhuang' || entry.id === 'faction_yanshi_fu') {
    const disciplesIndex = sections.findIndex(item => item.title === '弟子等级');
    const disciples = sections[disciplesIndex];
    const start = entry.id === 'faction_wanshou_shanzhuang'
      ? '\n弟子与弟子之间，都以清晰的利益关系维系。'
      : '\n极度崇尚理性，认为情感是干扰完美创造的杂念。';
    if (disciplesIndex < 0 || !disciples.content.includes(start)) {
      throw new Error(`The cropped atmosphere boundary changed: ${entry.id}`);
    }
    const [ranks, atmosphere] = disciples.content.split(start);
    disciples.content = ranks;
    sections.splice(disciplesIndex + 1, 0, {
      title: '门内风气', content: `…${start.slice(1)}${atmosphere}`,
    });
  }
  if (entry.id === 'faction_yanshi_fu') {
    const ingenious = sections.find(item => item.title === '▪ 《千机百变诀》 - 地阶上品');
    const repeatedOpening = '▪ 风格: 百巧机关。此流派追求极致的精巧与变化。他们创造的傀儡往往形态各异，小至可潜\n';
    if (!ingenious || !ingenious.content.startsWith(repeatedOpening)) {
      throw new Error('The overlapping 千机百变诀 crops changed');
    }
    ingenious.content = ingenious.content.slice(repeatedOpening.length);
  }
  if (entry.id === 'faction_wudu_shenjiao') {
    // The numbered crops lose two headings, but the older full screenshots
    // 26d2f418… and 529d0232… show both names and their continuation lines.
    const scorpionIndex = sections.findIndex(item => item.title === '天蝎脉 - 《天蝎夺魂经》');
    const scorpion = sections[scorpionIndex];
    const dragonBreak = '\n功》\n';
    if (scorpionIndex < 0 || !scorpion.content.includes(dragonBreak)) {
      throw new Error('The cropped 地龙脉 continuation changed; review both images');
    }
    const [scorpionText, dragonText] = scorpion.content.split(dragonBreak);
    scorpion.content = scorpionText;
    sections.splice(scorpionIndex + 1, 0, {
      title: '地龙脉 - 《地龙腐骨功》', content: dragonText,
    });
    const droppedDragonIndex = dropped.findIndex(item => item.entryId === entry.id &&
      item.reason === 'unreadable_heading' && item.text.includes('地龙腐骨[看不清]'));
    if (droppedDragonIndex < 0) throw new Error('The disputed 地龙脉 heading record changed');
    dropped.splice(droppedDragonIndex, 1);

    const centipedeIndex = sections.findIndex(item => item.title === '百足脉 - 《百足控心诀》');
    const centipede = sections[centipedeIndex];
    const spiderBreak = '\n• 风格：陷阱与幻毒。';
    if (centipedeIndex < 0 || !centipede.content.includes('…策》') || !centipede.content.includes(spiderBreak)) {
      throw new Error('The cropped 蛛神脉 continuation changed; review both images');
    }
    const [centipedeText, spiderText] = centipede.content.split(spiderBreak);
    // The same older screenshot shows the next complete clause, up to “从”.
    // Keep the sentence open there; its continuation remains outside the frame.
    centipede.content = centipedeText.replace('此脉弟子精通将…策》', '此脉弟子精通将子蛊植入他人体内，从…');
    sections.splice(centipedeIndex + 1, 0, {
      title: '蛛神脉 - 《蛛神罗网策》', content: `• 风格：陷阱与幻毒。${spiderText}`,
    });

    const toad = sections.find(item => item.title === '金蟾脉 - 《金蟾万毒体》');
    const overlappingCrop = '将……\n蟾"，号称能吞食万毒。此脉弟子以身试毒，将肉身';
    if (!toad || !toad.content.includes(overlappingCrop)) {
      throw new Error('The overlapping 金蟾脉 crops changed; review originals 126/127');
    }
    toad.content = toad.content.replace(overlappingCrop, '将肉身');
    const conduct = sections.find(item => item.title === '门内风气');
    const overlappingRule = '门规只有一条：只要你有则。门规只有一条：只要你有能力';
    if (!conduct || !conduct.content.includes(overlappingRule)) {
      throw new Error('The overlapping 五毒神教门规 crops changed; review originals 123/122');
    }
    conduct.content = conduct.content.replace(overlappingRule, '门规只有一条：只要你有能力');
  }
  if (entry.id === 'faction_tiangong_ge') {
    const branch = sections.find(item => item.title === '三大流派分支');
    if (!branch || !branch.content.includes('巨构院的杰作')) {
      throw new Error('Cannot recover the Tiangong first-branch label without the source body');
    }
    branch.content = `巨构院\n${branch.content}`;
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
    const organization = sections.find(item => item.title === '组织架构');
    const orphan = '技术挑战。这里是天工阁保持活力的心脏。';
    if (!organization || !organization.content.includes(orphan)) {
      throw new Error('Expected the unattributed Tiangong fragment for private preservation');
    }
    organization.content = organization.content.replace(`${orphan}\n`, '');
    dropped.push({ entryId: entry.id, reason: 'orphan_fragment_unattributed', text: orphan });
  }
  if (entry.id === 'faction_jingang_buhai_gu') {
    const places = sections.find(item => item.title === '（地点类条目小节，标题未见于素材）');
    if (!places || !places.content.includes('万丈渊')) {
      throw new Error('Cannot replace the missing-source heading without its place entries');
    }
    places.title = '山门场所';
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
