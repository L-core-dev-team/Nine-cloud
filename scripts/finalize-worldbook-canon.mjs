import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/finalize-worldbook-canon.mjs <private-review-dir>');
const reviewDir = resolve(reviewArgument);
const readJson = async name => JSON.parse(await readFile(join(reviewDir, name), 'utf8'));
const preview = await readJson('canon-final-preview.json');
const sourceData = await readJson('source-registry.json');
const ledger = await readJson('legacy-182-review-ledger.json');
const entries = preview.entries;
const sourceRegistry = sourceData.sources.map(({ id, type, reviewStatus }) => ({
  id, type, ...(reviewStatus ? { reviewStatus } : {}),
}));
const sourceIds = new Set(sourceRegistry.map(source => source.id));
const originalRecords = ledger.records.filter(item => item.disposition !== 'user_excluded');
if (ledger.records.length !== 182 || originalRecords.length !== 179 || entries.length !== 33) {
  throw new Error('Worldbook source coverage or entry count changed; audit before finalizing');
}
for (const entry of entries) {
  if (entry.status !== 'confirmed' || !entry.content || !entry.sourceRefs.length ||
    entry.sourceRefs.some(id => !sourceIds.has(id))) {
    throw new Error(`Unresolved canon entry: ${entry.id}`);
  }
}
const decisions = [
  { id: 'author_20260925_001', subject: '原088品阶数量',
    resolution: '正式文本列凡、黄、玄、地、天五阶；原转写的“四大”与五个列名不符，按枚举纠正数量。',
    sourceRefs: ['original_088'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_002', subject: '圣火教别称',
    resolution: '统一为圣火教；拜火圣教仅作为检索别名，不另建势力。',
    sourceRefs: ['original_092'], confidence: 'medium', newCoreFact: false },
  { id: 'author_20260925_003', subject: '原120→118跨图衔接',
    resolution: '按可辨图文恢复“上古血脉之力融入己身”；保留原两图及恢复记录。',
    sourceRefs: ['original_120', 'original_118'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_004', subject: '无法恢复的原图缺口',
    resolution: '只发布可确认片段，以省略号标出断裂；省略号及缺失文字不具有设定效力。未创造人物、势力、境界、数字或历史。',
    sourceRefs: [], confidence: 'policy', newCoreFact: false },
  { id: 'author_20260925_005', subject: '经济体系章节',
    resolution: '仅有标题及零散来源，缺完整可据正文；暂不发布为正式条目。',
    sourceRefs: ['original_085'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_006', subject: '原060/061缺标题的修仙基础段',
    resolution: '以描述性标题“修仙基础”单列，两页可辨正文照录；不推断被裁切的原始标题。',
    sourceRefs: ['original_060', 'original_061'], confidence: 'high', newCoreFact: false },
];
const registry = {
  schemaVersion: 1,
  activeVersion: '1.0',
  approvalMode: 'author_delegated_adjudication',
  approvalDate: '2026-09-25',
  reviewSummary: {
    legacyRecordsReconciled: 182,
    originalImagesAndTranscriptionsPaired: 179,
    userExcludedLegacyRecords: 3,
    originalImagesSpotChecked: sourceRegistry.filter(source => source.id.startsWith('original_') && source.reviewStatus === 'image_spot_checked').length,
    imageByImageVisualVerificationComplete: false,
    note: '正式条目按配对转写、来源核对和定点图像复查裁定。逐页人工图像复核未完成；残缺原文不作为设定。',
  },
  versionHistory: [{ version: '1.0', date: '2026-09-25', reason: '作者授权裁定后的世界书首版正式内容' }],
  documentOutlineSourceRefs: ['original_001'],
  entries,
  reviewQueue: [],
  sourceRegistry,
  decisions,
};
await writeFile(new URL('../packages/content/src/canon.registry.json', import.meta.url), `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(join(reviewDir, 'author-delegated-decisions-20260925.json'), `${JSON.stringify({
  schemaVersion: 1, decisions, droppedSourceFragments: preview.dropped,
  retainedIncompleteFragments: preview.retainedFragments,
  legacyRecordDispositions: ledger.records,
}, null, 2)}\n`);
console.log(`Finalized ${entries.length} sourced Canon entries; reconciled ${ledger.records.length} legacy records; ${preview.dropped.length} unrecoverable fragments archived privately.`);
