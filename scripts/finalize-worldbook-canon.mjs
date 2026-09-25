import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/finalize-worldbook-canon.mjs <private-review-dir>');
const reviewDir = resolve(reviewArgument);
const readJson = async name => JSON.parse(await readFile(join(reviewDir, name), 'utf8'));
const preview = await readJson('canon-final-preview.json');
const sourceData = await readJson('source-registry.json');
const ledger = await readJson('legacy-182-review-ledger.json');
const imageReview = await readJson('image-by-image-review-20260925.json');
const entries = preview.entries;
const imageReviewBySource = new Map([
  ...imageReview.originalImages, ...imageReview.supplementImages,
].map(item => [item.sourceId, item]));
const sourceRegistry = sourceData.sources.map(({ id, type, reviewStatus }) => ({
  id, type, ...(reviewStatus ? { reviewStatus } : {}),
  ...(imageReviewBySource.has(id) ? { imageReviewMethod: imageReviewBySource.get(id).reviewMethod } : {}),
}));
const sourceIds = new Set(sourceRegistry.map(source => source.id));
const originalRecords = ledger.records.filter(item => item.disposition !== 'user_excluded');
if (ledger.records.length !== 182 || originalRecords.length !== 179 || entries.length !== 33) {
  throw new Error('Worldbook source coverage or entry count changed; audit before finalizing');
}
if (imageReview.legacyRecords.length !== 182 || imageReview.originalImages.length !== 179 ||
  imageReview.supplementImages.length !== 28 || imageReviewBySource.size !== 207 ||
  imageReview.originalImages.some(item => item.disposition !== 'no_substantive_transcription_mismatch_detected')) {
  throw new Error('Image-by-image independent OCR review is incomplete');
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
  { id: 'author_20260925_007', subject: '原173→174功法引言',
    resolution: '原173页末“如同”与原174页首“支完整”之间仅补语法必需的“一”。',
    sourceRefs: ['original_173', 'original_174'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_008', subject: '原165→164驾驭之法',
    resolution: '保留原164页可辨的海兽契约与潮汐正文；原165页末“一套”后缺失的名词不猜，以省略号标示。',
    sourceRefs: ['original_165', 'original_164'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_009', subject: '天工阁匠师等级的多版本保全',
    resolution: '按既有作者裁定将“宗师”统一为“大宗师”；合并原051、原052及补005可辨的等级描述，保留不同版本中的炼器能力、万卷阁、引火锻体诀等信息，不将裁切部分补成事实。',
    sourceRefs: ['original_051', 'original_052', 'supplement_005'], confidence: 'high', newCoreFact: false },
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
    originalImagesIndependentlyOcrCrosschecked: imageReview.originalImages.length,
    supplementImagesIndependentlyOcrCrosschecked: imageReview.supplementImages.length,
    lowCoverageOriginalImagesDirectlyCompared: imageReview.summary.lowCoverageOriginalImagesDirectlyCompared,
    lowCoverageSupplementImagesDirectlyCompared: imageReview.summary.lowCoverageSupplementImagesDirectlyCompared,
    imageByImageIndependentOcrCrosscheckComplete: true,
    imageByImageVisualVerificationComplete: false,
    note: '179 张原图和 28 张补图已逐张独立 OCR 交叉核对，低匹配图已直接打开复核。此为 AI 辅助逐图裁定，不冒充作者本人逐页目视签收；残缺原文不作为设定。',
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
