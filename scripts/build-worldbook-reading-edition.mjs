import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const registry = JSON.parse(await readFile(new URL('packages/content/src/canon.registry.json', root), 'utf8'));
const runtime = JSON.parse(await readFile(new URL('packages/content/src/canon-runtime.json', root), 'utf8'));
const published = registry.entries.filter(entry => entry.status === 'confirmed' && entry.canonVersion === registry.activeVersion)
  .sort((a, b) => a.sortOrder - b.sortOrder);
assert.deepEqual(runtime.entries.map(entry => entry.id), published.map(entry => entry.id));
assert.ok(registry.resolvedSourceGaps?.length === 6 && registry.reviewQueue.length === 0);

const edition = [
  '# 《九霄》世界书 Canon 1.0 正式阅读版',
  '',
  '> 此文件由 `canon-runtime.json` 生成，正文逐字取自运行包。`…` 表示原图裁断或无法可靠恢复的边界，不能据此推断省略处的具体设定。来源与裁定见同目录审核表。',
  '',
  ...runtime.entries.flatMap(entry => [`## ${entry.title}`, '', entry.content.trim(), '']),
].join('\n');
const gapRows = registry.resolvedSourceGaps.map(item =>
  `| \`${item.id}\` | ${item.sourceRefs.map(ref => `\`${ref}\``).join('、')} |`);
const entryRows = published.map(entry =>
  `| \`${entry.id}\` | ${entry.title.replaceAll('|', '／')} | ${entry.sourceRefs.map(ref => `\`${ref}\``).join('、')} | ${(entry.content.match(/…/g) ?? []).length} |`);
const audit = [
  '# 《九霄》世界书 Canon 1.0 来源与缺口审核表',
  '',
  '> 与正式阅读版、`canon.registry.json` 同步生成。原图哈希、OCR 全文与本机路径仅保存在作者侧私有记录。这里的 `confirmed` 是现行作者委托裁定状态，不代表作者本人已逐页签字。',
  '',
  `- 正式条目：${published.length}；旧作者补充停用：${registry.entries.filter(entry => entry.status === 'deprecated').length}。`,
  `- 旧编号：${registry.reviewSummary.legacyRecordsReconciled} 条，${registry.reviewSummary.originalImagesAndTranscriptionsPaired} 张编号原图与逐图转写配对，${registry.reviewSummary.userExcludedLegacyRecords} 条按原决定排除。`,
  `- 首批原图/补图独立 OCR 交叉核对：${registry.reviewSummary.originalImagesIndependentlyOcrCrosschecked}/${registry.reviewSummary.supplementImagesIndependentlyOcrCrosschecked}；后补直接目视对照：${registry.reviewSummary.supplementImagesDirectlyComparedAfterInitialReview} 张。`,
  `- 六处已跟踪原图缺口：${registry.resolvedSourceGaps.length} 处有后补截图证据；待审队列：${registry.reviewQueue.length} 条。正文其他省略号仍提示原图局部裁断，不能按零缺字理解。`,
  '- 终审边界：作者本人逐字目视签收、游戏接入与真实回合验证均不由本表代替。',
  '',
  '## 已恢复的六处原图缺口', '',
  '| 缺口 ID | 后补图来源 |', '| --- | --- |', ...gapRows, '',
  '## 正式条目与来源', '',
  '| 条目 ID | 标题 | 来源 ID | 正文中省略号数 |', '| --- | --- | --- | ---: |', ...entryRows, '',
  '## 审核方法', '',
  '编号原图、首批补图、后补截图的核验范围与限制见 `docs/世界书Canon1.0交付说明.md`。旧一次性输出和未发布 OCR 不构成现行 Canon；正文变动须先更新作者登记册，再重新生成运行包和这两份文件。',
  '',
].join('\n');
await writeFile(new URL('outputs/九霄世界书/九霄世界书_Canon1.0_正式阅读版.md', root), edition, 'utf8');
await writeFile(new URL('outputs/九霄世界书/九霄世界书_Canon1.0_来源审核表.md', root), audit, 'utf8');
console.log(`Built worldbook reading edition and source audit for ${published.length} entries.`);
