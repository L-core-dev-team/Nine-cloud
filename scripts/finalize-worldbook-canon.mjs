import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/finalize-worldbook-canon.mjs <private-review-dir>');
// This historical one-shot finalizer predates the author's recovered source screenshots.
// Re-running it over the current registry would erase those confirmed corrections.
const currentRegistry = JSON.parse(await readFile(new URL('../packages/content/src/canon.registry.json', import.meta.url), 'utf8'));
if (currentRegistry.resolvedSourceGaps?.length) {
  throw new Error('Historical finalizer cannot overwrite the recovered Canon registry; use the current registry as source of truth.');
}
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
  imageReview.originalImages.some(item => !['no_substantive_transcription_mismatch_detected',
    'source_transcription_overreach_corrected_in_canon'].includes(item.disposition))) {
  throw new Error('Image-by-image independent OCR review is incomplete');
}
const authorAdditionSourceId = 'author_delegation_20260926';
sourceRegistry.push({ id: authorAdditionSourceId, type: 'author_delegated_addition',
  reviewStatus: 'author_delegated' });
sourceIds.add(authorAdditionSourceId);
const authorAdditionNote = '作者授权的保守新增设定；非原图转写。缺失原文仍在审核队列，若将来取得原图应重新核对。';
const authorAdditions = [
  { id: 'system_economy_author_addition', title: '经济体系补充', category: 'system',
    parentId: 'world_jiuxiao', sortOrder: 305,
    content: '修士交易多以灵石计价。资源的品阶、成色、供求与地域差异都会影响实际成交价；“经济与物价参考”所列价格仅作坊市通常行情参考。' },
  { id: 'faction_sihai_guest_court_addition', title: '四海商会·客卿院补充', category: 'faction',
    parentId: 'faction_sihai_shanghui', sortOrder: 51,
    content: '客卿院接待并协调商会聘请的外部修士。客卿的具体职责与报酬依约定确定，由商会按事务需要安排。' },
  { id: 'faction_tiangong_academies_addition', title: '天工阁·学宫与问道堂补充', category: 'faction',
    parentId: 'faction_tiangong_ge', sortOrder: 61,
    content: '三大学宫分别承接三大流派的教学与研究；问道堂供门人公开讨论器道问题。不同流派可以争论，也可以就具体炼器难题合作。' },
  { id: 'faction_jixia_discipline_addition', title: '稷下学宫·戒律院补充', category: 'faction',
    parentId: 'faction_jixia_xuegong', sortOrder: 81,
    content: '戒律院处理学宫内部的纪律事务，依学宫礼法规矩应对违反院规的行为，以维持求学和讲学秩序。' },
  { id: 'faction_beijing_shadow_addition', title: '北境联盟·幽影部补充', category: 'faction',
    parentId: 'faction_beijing_lianmeng', sortOrder: 171,
    content: '幽影部重视隐匿与侦察，惯于借冰雪地形掩护行动，并在接近目标后迅速突袭。' },
].map(item => ({ ...item, status: 'confirmed', canonVersion: '1.0',
  origin: 'author_addition', sections: [{ title: '作者补充', content: item.content }],
  aliases: [], tags: [item.title, '作者补充'], sourceRefs: [authorAdditionSourceId],
  publicSourceNote: authorAdditionNote, updatedAt: '2026-09-26' }));
entries.push(...authorAdditions);
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
  { id: 'author_20260925_010', subject: '天工阁巨构院与无归属残句',
    resolution: '三大流派首支正文明确称“巨构院的杰作”，据此恢复描述性小标题“巨构院”；原050页首“技术挑战。这里是天工阁保持活力的心脏。”缺机构主语，不在玩家正式正文中冒充完整机构介绍，原句保留在私有缺口记录。',
    sourceRefs: ['original_053', 'original_050', 'original_051'], confidence: 'medium', newCoreFact: false },
  { id: 'author_20260925_011', subject: '金刚不坏谷缺失的小节标题',
    resolution: '原小节标题未见于截图，正式版使用描述性标题“山门场所”归拢万丈渊、刑罚崖、药浴池等可辨条目；不声称此为原图标题。',
    sourceRefs: ['supplement_017'], confidence: 'medium', newCoreFact: false },
  { id: 'author_20260925_012', subject: '结丹期页顶旧转写越界',
    resolution: '原077图像顶部仅见被裁断的“态灵力”，无法确认旧转写额外写出的“将气态灵力压缩为液态灵力”。正式版删去这段未证实前缀，保留可见的凝丹描述；同章突破方式仍依原078记载液态灵力凝结固态金丹。',
    sourceRefs: ['original_077', 'original_078', 'original_076'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_013', subject: '五毒神教两处跨图功法名',
    resolution: '编号原图129和128的页底、页首只各显示半个条目；另存的旧设定截图26d2f418-e4b9-4fed-9082-7461613fafaf与529d0232-d8ab-4930-9268-a2e5b250d368直接显示完整名称“地龙脉 - 《地龙腐骨功》”和“蛛神脉 - 《蛛神罗网策》”。据两张旧截图恢复分支标题，并将误并入相邻分支的正文归回原分支；百足脉可见的“将子蛊植入他人体内，从”也照录，后续仍标缺口。原126/127的金蟾脉和原123/122的门规滚动重叠各只保留一遍。',
    sourceRefs: ['original_129', 'original_128', 'original_127', 'original_126', 'original_123', 'original_122'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_014', subject: '三处章节跨图归属与重叠',
    resolution: '原091/092的天阶功法末句是滚动重叠，正式版只保留完整句一次。昊天剑宗原009/010之间缺失的机构名称不可辨，“宗门最高权力中心”残句不发布；可辨的传功阁等机构另列于描述性“组织架构”。冰神宫原144/143之间缺失风气段句首，原143可辨的风气正文另列于描述性“门内风气”，以省略号提示句首缺口。',
    sourceRefs: ['original_091', 'original_092', 'original_009', 'original_010', 'original_144', 'original_143'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_015', subject: '万兽山庄与偃师府风气段归属',
    resolution: '原114/112之间与原105/104之间各缺风气小标题，正式版以描述性“门内风气”分出原图可辨正文，不再误挂“弟子等级”；句首缺口仍用省略号提示。偃师府《千机百变诀》两张滚动截图重复开头只保留完整的一版。',
    sourceRefs: ['original_114', 'original_112', 'original_105', 'original_104', 'original_109', 'original_108'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260925_016', subject: '三处跨图孤字残句',
    resolution: '玉清阁原013/014之间的“和力。”、四海商会原059/058之间的“量。”、稷下学宫原032/031之间的“非。”均缺可确认的前文或归属；这些孤字残句仅保存在私有缺口记录，不拼接成玩家可见的断裂句。其后有明确内容的条目原文照留。',
    sourceRefs: ['original_013', 'original_014', 'original_059', 'original_058', 'original_032', 'original_031'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260926_017', subject: '玉清阁地阶功法原图误读',
    resolution: '原016对应的完整尺寸原始截图 c5247208-8a14-49d2-984b-a6169b92b28f 清楚写作《万化丹尘》、地阶中品。逐图TXT的“万[看不清1字]丹王”为误读；依原图恢复完整名称并归回既有“护道奇术”描述，不新增设定。',
    sourceRefs: ['original_016'], confidence: 'high', newCoreFact: false },
  { id: 'author_20260926_018', subject: '保守补足五个可用内容条目',
    resolution: '依作者“直接自己编并编入游戏”的授权，另增经济体系、四海商会客卿院、天工阁学宫及问道堂、稷下学宫戒律院、北境联盟幽影部五个短条目。均单列 origin=author_addition、独立来源 ID 和公开来源说明，不伪称截图原文；不补核心人物、精确品阶或缺失价格。原图缺口继续保留在 reviewQueue。',
    sourceRefs: [authorAdditionSourceId], confidence: 'author_delegated', newCoreFact: true },
];
const reviewQueue = [
  { id: 'gap_economy_chapter', status: 'pending_review', sourceId: 'original_085',
    subject: '经济体系章节', reason: '仅见目录标题，未取得可靠正文；不得从经济与物价参考反推整章规则。' },
  { id: 'gap_beijing_technique_name', status: 'pending_review', sourceId: 'original_139',
    subject: '北境联盟幽影部功法全名', reason: '《冰原潜行…》末尾未入镜。' },
  { id: 'gap_sihai_missing_page', status: 'pending_review', sourceId: 'original_059',
    subject: '四海商会客卿院等缺页', reason: '两张相邻图之间缺一页，机构正文无法据现有图恢复。' },
  { id: 'gap_tiangong_missing_page', status: 'pending_review', sourceId: 'original_051',
    subject: '天工阁机构缺页', reason: '神工殿末尾及三大学宫、问道堂条目未入镜。' },
  { id: 'gap_jixia_missing_page', status: 'pending_review', sourceId: 'original_032',
    subject: '稷下学宫机构缺页', reason: '讲经堂末尾及戒律院完整条目未入镜。' },
  { id: 'gap_price_table_rows', status: 'pending_review', sourceId: 'supplement_024',
    subject: '物价表黄阶上品与玄阶下品', reason: '两行价格不在现有截图中；正式表仅列有原图证据的行。' },
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
    additionalOriginalImagesDirectlyCompared: imageReview.summary.additionalOriginalImagesDirectlyCompared,
    originalTranscriptionOverreachCorrected: imageReview.summary.originalTranscriptionOverreachCorrected,
    imageByImageIndependentOcrCrosscheckComplete: true,
    imageByImageVisualVerificationComplete: false,
    authorAdditionsIncluded: authorAdditions.length,
    note: '179 张原图和 28 张补图已逐张独立 OCR 交叉核对，低匹配图已直接打开复核。此为 AI 辅助逐图裁定，不冒充作者本人逐页目视签收；残缺原文不作为设定。',
  },
  versionHistory: [{ version: '1.0', date: '2026-09-25', reason: '作者授权裁定后的世界书首版正式内容' }],
  contentRevisions: [{ date: '2026-09-26', reason: '另列五条作者授权补充，不改原图转写',
    decisionId: 'author_20260926_018' }],
  documentOutlineSourceRefs: ['original_001'],
  entries,
  reviewQueue,
  sourceRegistry,
  decisions,
};
await writeFile(new URL('../packages/content/src/canon.registry.json', import.meta.url), `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(join(reviewDir, 'author-delegated-decisions-20260925.json'), `${JSON.stringify({
  schemaVersion: 1, decisions, droppedSourceFragments: preview.dropped,
  retainedIncompleteFragments: preview.retainedFragments,
  legacyRecordDispositions: ledger.records,
}, null, 2)}\n`);
console.log(`Finalized ${entries.length} Canon entries (${authorAdditions.length} separately attributed author additions); reconciled ${ledger.records.length} legacy records; ${preview.dropped.length} unrecoverable fragments archived privately.`);
