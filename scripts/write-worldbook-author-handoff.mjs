import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/write-worldbook-author-handoff.mjs <private-review-dir>');
const reviewDir = resolve(reviewArgument);
const audit = JSON.parse(await readFile(join(reviewDir, 'source-audit.json'), 'utf8'));
const registry = JSON.parse(await readFile(join(reviewDir, 'canon-review-registry.json'), 'utf8'));
const textCoverage = JSON.parse(await readFile(join(reviewDir, 'text-coverage.json'), 'utf8'));
const visual = new Set(audit.visualReviewNumbers);
const ledger = audit.legacy182Crosswalk.map(item => ({
  legacy182Number: item.legacy182Number,
  originalNumber: item.originalNumber ?? null,
  originalSourceId: item.originalSourceId,
  legacyOcrId: item.legacyOcrId,
  disposition: item.status === 'user_excluded' ? 'user_excluded' :
    visual.has(Number(item.originalNumber)) ? 'mapped_transcribed_cited_image_spot_checked' : 'mapped_transcribed_cited_image_final_check_open',
  authorFinalApproval: false,
}));
const gaps = registry.entries.flatMap(entry => entry.reviewFlags.map(flag => ({ entryId: entry.id, flag })));
const conflicts = [
  { id: 'conflict_technique_grade_count', entryId: 'system_technique_grade', sourceRefs: ['original_088'],
    observed: '原088图片原文写“四大基础品阶”，随后列出“凡、黄、玄、地、天”五项。',
    decisionNeeded: '确认“四大”应改为“五大”，还是“凡阶”不计基础品阶；未改原文。' },
  { id: 'conflict_fire_sect_name', entryId: 'faction_shenghuo_jiao', sourceRefs: ['original_092', 'original_160'],
    observed: '原092功法举例称“拜火圣教”，西荒势力与宗门章节称“圣火教”。',
    decisionNeeded: '确认是否同一势力的别名/旧称，不能自动合并为正式别名。' },
];
const material = [
  '# 《九霄》世界书作者侧交接与自检（候选，不是发布签字）', '',
  '## 结论与边界', '',
  `旧 182 条清单已逐项形成去向：179 项映射到现存原图、3 项按已有用户记录排除。179 对原图/TXT 均存在，修订候选稿引用覆盖 179/179；相关补图 24/24 已进入正文或异文说明。${audit.summary.duplicateImageAliasesReconciled} 个 UUID 差异由旧 OCR 的 duplicates 表核对。`,
  `已记录至少局部视觉复核 ${visual.size}/179。其余图虽有逐图文字和拼接记录，不能据此声称已逐字原图终审。候选条目 ${registry.entries.length} 条中 ${registry.entries.filter(entry => entry.status === 'pending_review').length} 条 pending_review、${registry.entries.filter(entry => entry.status === 'conflict').length} 条 conflict、0 条 confirmed；未覆盖既有 7 条已发布地理 Canon，也未写入游戏。`,
  `当前候选稿仍标有疑似缺失 ${audit.summary.suspectedGapMarkers} 处、待确认 ${audit.summary.uncertaintyMarkers} 处、看不清 ${audit.summary.unreadableMarkers} 处。计数包含说明及跨页标记，不代表各有一项独立事实。`, '',
  `自动文字片段复查：179份逐图文字的8字片段匹配率均高于50%；${textCoverage.results.filter(item => item.coverage >= .8).length}/179达到80%。原052（异文并录）与原094（表格OCR断列）低于80%，已定点核查；此算法不能替代原图逐字对读。`, '',
  '## 本轮确定修复', '',
  '- 原120《万兽洪荒经》天阶中品整页在旧拼接稿中漏引用。已根据原120图片及逐图文字，插入 119 与 118 之间；页尾句未见完整原文，保留缺失标记。源文件未被覆盖。',
  '- 补005是天工阁等级的第三版异文佐证，不应硬插入正文；已在覆盖审计中与23张直接引用的补图分开计数。', '',
  '## 新发现的原设冲突（未擅自改写）', '',
  '- 原088图片确实写“四大基础品阶”，却列出凡、黄、玄、地、天五项。需要作者决定计数或凡阶归属。',
  '- 原092图片称“拜火圣教”，西荒原160及宗门章节称“圣火教”。需要作者确认是否别名、旧名或不同组织。', '',
  '## 关键规则证据与仍需裁定的边界', '',
  '| 主题 | 可由现有文字确定 | 暂不能当成通用规则 |', '| --- | --- | --- |',
  '| 九霄地图与五域 | 原002列中州、东瀚、西荒、北境、南疆，以及洪荒妖林；各域概述有来源引用。 | 每个新角色的出生点、全部地理坐标和可达性没有完整规则表。 |',
  '| 境界 | 原073–086有炼体、炼气、筑基、结丹、元婴、合体、化神、大乘、渡劫的小节；原096–098给出部分社会层级。 | 多处小节开头和突破过程缺文，不能推断所有条件、概率或寿元；不得按常见修仙模板改动“合体→化神”顺序。 |',
  '| 势力 | 五域的宗门、商会、皇朝等大量来源段落已拼接；万兽山庄原120现已找回。 | 宗门全员数值表、势力关系图和 NPC 知情边界仍未在原设中完整给出。 |',
  '| 资源与经济 | 原072给资源品阶概述；补024、原093–094给部分灵石参考物价。 | “经济体系”整章正文未见；黄阶上品、玄阶下品物价缺行；不能凭常识补货币汇率或所有权转移规则。 |',
  '| 伤亡与重生 | 原075写筑基失败可能死亡；原079写元婴肉身被毁后可遁走、夺舍且有业力；个别功法有特殊恢复描述。 | 没有统一的死亡、复活、伤残状态机；个别特殊功法不能推广为所有角色可复活。 |',
  '| 关键人物 | 文中存在职衔及少量名称，来源可追溯。 | 没有完整关键人物身份、关系、动机、所知与剧情禁则表；不能用 AI 自行生成的 NPC 事实补作 Canon。 |', '',
  '## 待作者重点看', '',
  '1. 逐图终审：见 `legacy-182-review-ledger.json`。这是逐项去向表，不把“有文字稿”假报为视觉审定。',
  '2. 原120页末《万兽洪荒经》特点断句及与原118页首的连接，保留在候选稿，不擅自补成硬设定。',
  '3. 经济体系整章缺正文、物价表缺两行，以及境界突破多处缺句，必须保持待核。',
  '4. 既有用户裁定的天工阁“大宗师”、商会客卿院位置、稷下戒律院、洪荒妖林章名等，继续依原拼接审核报告保留，不重新猜。', '',
  '## 给技术合作者的内容契约（未改其代码）', '',
  '- 运行时只选 confirmed 且当前版本的条目；pending_review、conflict、deprecated 一律不进入模型上下文或玩家正式资料库。',
  '- 搜索可按标题、别名、标签、正文定位；剧情上下文检索按地点、人物、势力和输入关键词选相关条目并控制数量，不发送整本世界书。未检索到不等于世界中不存在。',
  '- Canon 是只读世界事实，单局经历只入存档；模型不能把新剧情写回 Canon。',
  '- 私有原图、OCR、逐图记录、绝对路径、内部裁定说明不可打入玩家包；公开来源说明与私有 sourceRefs 分开。',
  '- 版本变动必须留旧/新版本、原因、时间和作者决定；冲突由作者裁定，技术侧不自动选择。', '',
  '## 本轮交付文件', '',
  '- `世界书_拼接修订候选.md`：仅修复原120遗漏，仍保留原文疑点。',
  '- `source-audit.json`、`source-audit.md`：图文配对、SHA-256、编号、引用覆盖。',
  '- `text-coverage.json`：逐图文字与拼接候选稿的片段覆盖核查。',
  '- `legacy-182-review-ledger.json`：182项逐项去向与实际审核状态。',
  '- `source-registry.json`：私有来源登记；`author-decisions.json`：此前10项作者口头裁定；`canon-review-registry.json`：34条有稳定 ID 的待审内容候选。',
  '- `review-flags.json`：逐条未决标记。', '',
  '- `章节审核矩阵.md`：34个章节候选逐条状态、来源及缺口数量，便于逐章审阅。', '',
  '- `canon-conflicts.json`：两项新发现的原文层面冲突，均未进入正式 Canon。', '',
  '以上均在私有审核目录，未写入游戏运行时代码或公开仓库。', '',
].join('\n');
await writeFile(join(reviewDir, 'legacy-182-review-ledger.json'), `${JSON.stringify({ schemaVersion: 1, records: ledger }, null, 2)}\n`);
await writeFile(join(reviewDir, 'review-flags.json'), `${JSON.stringify({ schemaVersion: 1, flags: gaps }, null, 2)}\n`);
await writeFile(join(reviewDir, 'canon-conflicts.json'), `${JSON.stringify({ schemaVersion: 1, conflicts }, null, 2)}\n`);
await writeFile(join(reviewDir, '章节审核矩阵.md'), [
  '# 九霄世界书章节审核矩阵', '',
  '> 此表是作者审阅队列。sourceRefs 含原图、补图和已记录的作者局部裁定；有引用不等于整章终审。', '',
  '| 条目 | 分类 | 状态 | 来源数 | 未决标记数 | 重点 |', '| --- | --- | --- | ---: | ---: | --- |',
  ...registry.entries.map(entry => `| ${entry.title.replaceAll('|', '／')} | ${entry.category} | ${entry.status} | ${entry.sourceRefs.length} | ${entry.reviewFlags.length} | ${entry.id === 'system_economy' ? '整章正文缺失' : entry.conflictIds.length ? entry.conflictIds.join('、') : entry.reviewFlags.length ? entry.reviewFlags[0].slice(0, 45).replaceAll('|', '／') : '无已标记缺口'} |`),
  '',
].join('\n'));
await writeFile(join(reviewDir, '世界书_作者侧交接与自检.md'), material);
console.log(JSON.stringify({ legacyRecords: ledger.length, imageSpotChecked: ledger.filter(item => item.disposition.endsWith('spot_checked')).length,
  excluded: ledger.filter(item => item.disposition === 'user_excluded').length,
  candidateEntries: registry.entries.length, reviewFlags: gaps.length }, null, 2));
