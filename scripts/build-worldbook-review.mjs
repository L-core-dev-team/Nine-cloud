import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument, sourceArgument] = process.argv.slice(2);
if (!reviewArgument || !sourceArgument) throw new Error('Usage: node scripts/build-worldbook-review.mjs <private-review-dir> <private-source-dir>');
const reviewDir = resolve(reviewArgument);
const manuscript = await readFile(join(reviewDir, '世界书_拼接修订候选.md'), 'utf8');
const sourceAudit = JSON.parse(await readFile(join(reviewDir, 'source-audit.json'), 'utf8'));
const priorReview = await readFile(join(resolve(sourceArgument), '拼接审核报告.md'), 'utf8');
if (sourceAudit.summary.issues.length || sourceAudit.summary.originalCitationsFound !== 179) {
  throw new Error('Complete source coverage audit required before building review registry');
}
const ids = new Map(Object.entries({
  '九霄大陆地图': 'world_jiuxiao',
  '中州天枢域': 'region_zhongzhou_tianshu', '东瀚龙吟域': 'region_donghan_longyin',
  '西荒焚天域': 'region_xihuang_fentian', '北境霜寒域': 'region_beijing_shuanghan',
  '南疆万蛊域': 'region_nanjiang_wangu', '妖域：洪荒妖林': 'region_honghuang_yaolin',
  '通用设定部分': 'system_general',
  '昊天剑宗': 'faction_haotian_jianzong', '玉清阁': 'faction_yuqing_ge',
  '衍天宗': 'faction_yantian_zong', '四海商会': 'faction_sihai_shanghui',
  '天工阁': 'faction_tiangong_ge', '大光明寺': 'faction_daguangming_si',
  '稷下学宫': 'faction_jixia_xuegong', '听潮阁': 'faction_tingchao_ge',
  '覆海宗': 'faction_fuhai_zong', '圣火教': 'faction_shenghuo_jiao',
  '金刚不坏谷': 'faction_jingang_buhai_gu', '冰神宫': 'faction_bingshen_gong',
  '北境联盟': 'faction_beijing_lianmeng', '五毒神教': 'faction_wudu_shenjiao',
  '万兽山庄 - 宗门设定详解': 'faction_wanshou_shanzhuang',
  '偃师府': 'faction_yanshi_fu',
  '常见修炼流派': 'system_cultivation_schools', '邪修体系': 'system_heterodox_cultivation',
  '资源的品级与境界划分': 'system_resource_grade', '修炼境界介绍': 'system_cultivation_realm',
  '灵根资质与影响': 'system_spiritual_root', '功法的品阶划分': 'system_technique_grade',
  '经济体系': 'system_economy', '经济与物价参考': 'system_prices',
  '妖兽体系总览': 'system_spirit_beasts',
  '境界金字塔与宗门设定': 'system_realm_faction_tiers',
}));
const conflicts = {
  system_technique_grade: ['conflict_technique_grade_count'],
  faction_shenghuo_jiao: ['conflict_fire_sect_name'],
};
const decisionEntryIds = [
  ['faction_tiangong_ge'], ['faction_sihai_shanghui'], ['faction_sihai_shanghui'],
  ['faction_daguangming_si'], ['faction_daguangming_si'], ['faction_jixia_xuegong'],
  ['faction_tiangong_ge'], ['region_honghuang_yaolin'], ['system_realm_faction_tiers'],
  ['system_general'],
];
const authorDecisions = [...priorReview.matchAll(/^\| (\d{1,2}) \| "([^"]+)" \| ([^\r\n]+) \|$/gm)]
  .filter(match => Number(match[1]) >= 1 && Number(match[1]) <= 10)
  .map(match => ({ id: `review_decision_${String(match[1]).padStart(3, '0')}`, type: 'review_decision',
    entryIds: decisionEntryIds[Number(match[1]) - 1], authorWords: match[2], recordedApplication: match[3],
    status: 'author_decided_specific_point', private: true }));
if (authorDecisions.length !== 10) throw new Error(`Expected 10 prior author decisions, got ${authorDecisions.length}`);
const lines = manuscript.split(/\r?\n/);
const headings = [];
for (let i = 0; i < lines.length; i++) {
  const match = /^(#{1,3}) (.+)$/.exec(lines[i]);
  if (match) headings.push({ level: match[1].length, title: match[2].trim(), line: i });
}
const entries = [];
let parentId = null;
for (let index = 0; index < headings.length; index++) {
  const heading = headings[index];
  if (heading.level === 1) parentId = ids.get(heading.title) ?? null;
  if (!ids.has(heading.title)) continue;
  const end = headings.slice(index + 1).find(next => heading.level === 1 || next.level <= heading.level)?.line ?? lines.length;
  const body = lines.slice(heading.line + 1, end).join('\n').trim();
  const sourceRefs = [];
  for (const mark of body.matchAll(/【来源：([^】]+)】/g)) {
    for (const match of mark[1].matchAll(/补(\d{3})|(?<!补)(?<!\d)(\d{3})(?!\d)/g)) {
      const id = match[1] ? `supplement_${match[1]}` : `original_${match[2]}`;
      if (!sourceRefs.includes(id)) sourceRefs.push(id);
    }
  }
  const reviewFlags = [...body.matchAll(/⟦(疑似缺失|待确认)：([^⟧]+)⟧|\[看不清[^\]]*\]/g)]
    .map(match => match[0]);
  const sections = [];
  for (let cursor = heading.line + 1; cursor < end; cursor++) {
    const sub = /^(#{2,4}) (.+)$/.exec(lines[cursor]);
    if (sub && sub[1].length > heading.level) sections.push({ level: sub[1].length, title: sub[2].trim() });
  }
  const entryId = ids.get(heading.title);
  const decisionRefs = authorDecisions.filter(decision => decision.entryIds.includes(entryId)).map(decision => decision.id);
  entries.push({ id: entryId, title: heading.title,
    category: entryId.startsWith('world_') ? 'world_overview' : entryId.startsWith('region_') ? 'region' :
      entryId === 'system_general' ? 'system_group' : entryId.startsWith('faction_') ? 'faction' : 'system',
    parentId: heading.level === 1 ? null : parentId,
    status: conflicts[entryId] ? 'conflict' : 'pending_review', canonVersion: null, aliases: [], tags: [],
    conflictIds: conflicts[entryId] ?? [],
    sourceRefs: [...sourceRefs, ...decisionRefs], sections, reviewFlags, contentDraft: body, sortOrder: entries.length * 10,
    reviewNote: '拼接及来源覆盖已核；未据此宣称逐字图像复核或作者最终批准。',
  });
}
const sourceRegistry = [
  ...sourceAudit.originals.map(item => ({ id: `original_${item.number}`, type: 'original_image', originalId: item.sourceId,
    legacyOcrId: item.oldOcrId, imageSha256: item.imageSha256, transcriptionSha256: item.textSha256,
    reviewStatus: sourceAudit.visualReviewNumbers.includes(Number(item.number)) ? 'image_spot_checked' : 'transcribed_not_image_finalized', private: true })),
  ...sourceAudit.supplements.map(item => ({ id: `supplement_${item.number}`, type: 'original_image',
    imageSha256: item.imageSha256, transcriptionSha256: item.textSha256,
    reviewStatus: Number(item.number) <= 4 ? 'excluded_non_worldbook' : 'transcribed_not_image_finalized', private: true })),
  ...sourceAudit.userExcludedOldRecords.map(item => ({ id: `excluded_legacy_${String(item.old182Number).padStart(3, '0')}`,
    type: 'excluded_old_ocr', originalId: item.sourceId,
    reviewStatus: 'user_excluded', private: true })),
  ...authorDecisions,
];
const registryIds = new Set(sourceRegistry.map(source => source.id));
const badRefs = entries.flatMap(entry => entry.sourceRefs.filter(ref => !registryIds.has(ref)).map(ref => `${entry.id}:${ref}`));
if (badRefs.length) throw new Error(`Unknown source refs: ${badRefs.join(', ')}`);
const result = { schemaVersion: 1, candidateVersion: '1.0-review', entries };
await writeFile(join(reviewDir, 'canon-review-registry.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(join(reviewDir, 'source-registry.json'), `${JSON.stringify({ schemaVersion: 1, sources: sourceRegistry }, null, 2)}\n`);
await writeFile(join(reviewDir, 'author-decisions.json'), `${JSON.stringify({ schemaVersion: 1, decisions: authorDecisions }, null, 2)}\n`);
console.log(JSON.stringify({ entries: entries.length, sources: sourceRegistry.length,
  entriesWithReviewFlags: entries.filter(entry => entry.reviewFlags.length).length,
  entriesWithoutDirectSourceRefs: entries.filter(entry => !entry.sourceRefs.some(ref => ref.startsWith('original_') || ref.startsWith('supplement_'))).map(entry => entry.id),
  pending: entries.filter(entry => entry.status === 'pending_review').length,
  conflicts: entries.filter(entry => entry.status === 'conflict').length,
  confirmed: entries.filter(entry => entry.status === 'confirmed').length, badRefs }, null, 2));
