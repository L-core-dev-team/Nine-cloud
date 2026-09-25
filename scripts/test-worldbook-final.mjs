import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const registry = await readJson('../packages/content/src/canon.registry.json');
const runtime = await readJson('../packages/content/src/canon-runtime.json');
const sourceIds = new Set(registry.sourceRegistry.map(source => source.id));
const entryIds = new Set(registry.entries.map(entry => entry.id));

assert.equal(registry.activeVersion, '1.0');
assert.equal(registry.reviewSummary.legacyRecordsReconciled, 182);
assert.equal(registry.reviewSummary.originalImagesAndTranscriptionsPaired, 179);
assert.equal(registry.reviewSummary.userExcludedLegacyRecords, 3);
assert.equal(registry.reviewSummary.originalImagesIndependentlyOcrCrosschecked, 179);
assert.equal(registry.reviewSummary.supplementImagesIndependentlyOcrCrosschecked, 28);
assert.equal(registry.reviewSummary.imageByImageIndependentOcrCrosscheckComplete, true);
assert.equal(registry.reviewSummary.originalTranscriptionOverreachCorrected, 1);
assert.equal(registry.reviewSummary.imageByImageVisualVerificationComplete, false);
assert.equal(registry.entries.length, 33);
assert.equal(runtime.entries.length, registry.entries.length);
assert.equal(entryIds.size, registry.entries.length);
assert.equal(sourceIds.size, registry.sourceRegistry.length);
assert.equal(registry.sourceRegistry.filter(source => source.id.startsWith('original_') && source.imageReviewMethod).length, 179);
assert.equal(registry.sourceRegistry.filter(source => source.id.startsWith('supplement_') && source.imageReviewMethod).length, 28);
assert.equal(registry.reviewQueue.length, 7, 'source gaps that cannot be safely restored must remain explicit');
assert.ok(registry.reviewQueue.every(item => item.status === 'pending_review' && sourceIds.has(item.sourceId)));
assert.ok(registry.entries.every(entry => entry.status === 'confirmed' &&
  entry.canonVersion === registry.activeVersion && entry.content.trim() &&
  entry.sourceRefs.length && entry.sourceRefs.every(id => sourceIds.has(id)) &&
  (!entry.parentId || entryIds.has(entry.parentId))));
const citedSources = new Set([
  ...registry.documentOutlineSourceRefs,
  ...registry.entries.flatMap(entry => entry.sourceRefs),
]);
assert.ok(registry.sourceRegistry.filter(source => source.id.startsWith('original_')).every(source => citedSources.has(source.id)));
assert.deepEqual(runtime.entries.map(entry => entry.id), registry.entries.slice()
  .sort((a, b) => a.sortOrder - b.sortOrder).map(entry => entry.id));
assert.ok(runtime.entries.every(entry => !('sourceRefs' in entry)));
const text = runtime.entries.map(entry => entry.content).join('\n');
for (const expected of ['万兽洪荒经', '圣火教', '资质决定论', '法器：各类修仙武器',
  '上古血脉之力融入己身', '海兽军团', '如同一支完整的交响乐团',
  '引火锻体诀', '万卷阁', '玄阶上品', '三大院的执掌者']) {
  assert.ok(text.includes(expected), `missing key source content: ${expected}`);
}
const tiangong = registry.entries.find(entry => entry.id === 'faction_tiangong_ge');
assert.ok(tiangong.sections.find(section => section.title === '三大流派分支').content.startsWith('巨构院\n'));
assert.ok(!tiangong.content.includes('技术挑战。这里是天工阁保持活力的心脏。'));
assert.ok(registry.entries.find(entry => entry.id === 'faction_jingang_buhai_gu').sections.some(section => section.title === '山门场所'));
assert.ok(!text.includes('地点类条目小节'));
const wudu = registry.entries.find(entry => entry.id === 'faction_wudu_shenjiao');
assert.ok(wudu.sections.some(section => section.title === '地龙脉 - 《地龙腐骨功》' && section.content.includes('诅咒与瘟疫')));
assert.ok(wudu.sections.some(section => section.title === '蛛神脉 - 《蛛神罗网策》' && section.content.includes('陷阱与幻毒')));
assert.ok(wudu.sections.some(section => section.title === '百足脉 - 《百足控心诀》' && section.content.includes('将子蛊植入他人体内，从…')));
assert.ok(!wudu.content.includes('\n功》\n'));
assert.ok(!wudu.content.includes('…策》'));
assert.ok(!wudu.content.includes('将……\n蟾'));
assert.ok(!wudu.content.includes('只要你有则。门规只有一条'));
const realms = registry.entries.find(entry => entry.id === 'system_cultivation_realm');
assert.deepEqual(realms.sections.map(section => section.title),
  ['炼体期', '炼气期', '筑基期', '结丹期', '元婴期', '合体期', '化神期', '大乘期', '渡劫期']);
const jiedan = realms.sections.find(section => section.title === '结丹期').content;
assert.ok(!jiedan.includes('气态灵力压缩为液态灵力'));
assert.ok(jiedan.includes('液态灵力压缩凝结成一颗固态金丹'));
const prices = registry.entries.find(entry => entry.id === 'system_prices').content;
assert.ok(prices.includes('| 黄阶中品 | 300 | 400 | 500 | 750 |\n| 玄阶中品 |'));
assert.ok(prices.includes('| 地阶上品 | 80万(80上品) | 100万(100上品) | 130万(130上品) | 180万(180上品) |\n天阶'));
assert.ok(!prices.includes('|…'));
assert.equal(registry.entries.filter(entry => entry.category === 'region' && entry.id !== 'region_honghuang_yaolin').length, 5);
assert.ok(!/⟦|【来源：|\[看不清|本章开头|小节标题缺失|经看原图确认|C:[\\/]/.test(text));
assert.ok(!/C:[\\/]|imageSha256|transcriptionSha256|originalId|legacyOcrId/.test(JSON.stringify(runtime)));
console.log('Worldbook Canon coverage, runtime isolation and source-grounded content checks passed.');
