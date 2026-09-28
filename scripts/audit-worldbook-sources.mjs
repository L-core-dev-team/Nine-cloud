import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Private source files stay outside the repository. Only hashes, IDs and counts
// are written to the caller-selected review directory.
const [sourceArgument, outputArgument, draftArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) {
  throw new Error('Usage: node scripts/audit-worldbook-sources.mjs <private-source-dir> <private-output-dir>');
}
const sourceDir = resolve(sourceArgument);
const outputDir = resolve(outputArgument);
const readSource = name => readFile(join(sourceDir, name));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const oldOcr = JSON.parse(await readFile(new URL('../outputs/设定OCR数据.json', import.meta.url), 'utf8'));
const oldIds = new Set(oldOcr.records.map(record => record.id));
const mapping = (await readSource('编号对照.txt')).toString('utf8');
const draft = (await readFile(draftArgument ? resolve(draftArgument) : join(sourceDir, '世界书_拼接初稿.md'))).toString('utf8');
const review = (await readSource('拼接审核报告.md')).toString('utf8');
const mapPattern = /^(\d{3})\.png <- (\d{3})\.png <- (\d{3})\.png <- ([0-9a-f-]{36})\.png$/gm;
const mapped = [...mapping.matchAll(mapPattern)].map(match => ({
  number: Number(match[1]), old182Number: Number(match[2]),
  originalNumber: Number(match[3]), sourceId: match[4],
}));
const deleted = [...mapping.matchAll(/^(\d{3})\.png <- \d{3}\.png <- ([0-9a-f-]{36})\.png$/gm)]
  .map(match => ({ old182Number: Number(match[1]), sourceId: match[2] }))
  .filter(item => !mapped.some(other => other.sourceId === item.sourceId));
const issues = [];
if (mapped.length !== 179) issues.push(`Expected 179 mapped original images; found ${mapped.length}`);
if (deleted.length !== 3) issues.push(`Expected 3 user-excluded old records; found ${deleted.length}`);
if (new Set(mapped.map(item => item.number)).size !== mapped.length) issues.push('Repeated new image number');
if (new Set(mapped.map(item => item.sourceId)).size !== mapped.length) issues.push('Repeated original source ID');
const duplicateAliases = oldOcr.duplicates ?? {};
const oldIdFor = id => duplicateAliases[`${id}.png`]?.replace(/\.png$/, '') ?? id;
const aliasMappings = mapped.filter(item => oldIdFor(item.sourceId) !== item.sourceId)
  .map(item => ({ number: item.number, sourceId: item.sourceId, oldOcrId: oldIdFor(item.sourceId) }));
const mappedIds = new Set([...mapped, ...deleted].map(item => oldIdFor(item.sourceId)));
if (mappedIds.size !== oldIds.size || [...oldIds].some(id => !mappedIds.has(id))) issues.push('Old 182 IDs still do not reconcile after recorded duplicate-image aliases');

const sourceMarks = [...draft.matchAll(/【来源：([^】]+)】/g)].map(match => match[1]);
const citedOriginals = new Set();
const citedSupplements = new Set();
for (const mark of sourceMarks) {
  for (const found of mark.matchAll(/补(\d{3})/g)) citedSupplements.add(Number(found[1]));
  for (const found of mark.matchAll(/(?<!补)(?<!\d)(\d{3})(?!\d)/g)) citedOriginals.add(Number(found[1]));
}
const fileRecord = async (prefix, number) => {
  const id = String(number).padStart(3, '0');
  const imageName = `${prefix}${id}.png`;
  const textName = `${prefix}${id}.txt`;
  try {
    const [image, text] = await Promise.all([readSource(imageName), readSource(textName)]);
    const png = image.toString('ascii', 1, 4) === 'PNG';
    const dimensions = png && image.length >= 24 ? [image.readUInt32BE(16), image.readUInt32BE(20)] : null;
    if (!png || !text.length) issues.push(`Invalid or empty source pair: ${prefix}${id}`);
    return {
      number: id, imageName, textName, imageBytes: image.length,
      textBytes: text.length, imageSha256: sha256(image), textSha256: sha256(text),
      dimensions,
      citedInStitchedDraft: prefix === '原' ? citedOriginals.has(number) : citedSupplements.has(number),
    };
  } catch {
    issues.push(`Missing source pair: ${prefix}${id}`);
    return { number: id, imageName, textName, missing: true };
  }
};
const originals = await Promise.all(mapped.map(async item => ({
  ...item, ...await fileRecord('原', item.number),
  oldOcrId: oldIdFor(item.sourceId),
  oldOcrRecordPresent: oldIds.has(oldIdFor(item.sourceId)),
})));
const supplements = await Promise.all(Array.from({ length: 28 }, (_, i) => fileRecord('补', i + 1)));
for (const item of originals) {
  if (!item.citedInStitchedDraft) issues.push(`Original not cited in stitched draft: ${item.number}`);
}
for (const item of supplements) {
  const number = Number(item.number);
  if (number >= 5 && !item.citedInStitchedDraft && !draft.includes(`补${item.number}`)) issues.push(`Relevant supplement neither cited nor discussed in stitched draft: ${item.number}`);
  if (number <= 4 && item.citedInStitchedDraft) issues.push(`Non-worldbook supplement unexpectedly cited: ${item.number}`);
}
for (const number of citedOriginals) if (number < 1 || number > 179) issues.push(`Unknown original citation: ${number}`);
for (const number of citedSupplements) if (number < 5 || number > 28) issues.push(`Unknown supplement citation: ${number}`);
const priorReportVisualReviewNumbers = [49, 3, 71, 84, 92, 95, 103, 150, 172, 57, 58, 59, 60, 93, 1, 51, 52];
const thisPassSpotCheckNumbers = [72, 81, 83, 88, 92, 93, 94, 95, 120];
const visualReviewNumbers = [...new Set([...priorReportVisualReviewNumbers, ...thisPassSpotCheckNumbers])];
const summary = {
  oldOcrRecords: oldIds.size, mappedOriginals: mapped.length, userExcludedOldRecords: deleted.length,
  duplicateImageAliasesReconciled: aliasMappings.length,
  originalPairsPresent: originals.filter(item => !item.missing).length,
  originalCitationsFound: originals.filter(item => item.citedInStitchedDraft).length,
  supplementPairsPresent: supplements.filter(item => !item.missing).length,
  relevantSupplementCitationsFound: supplements.filter(item => Number(item.number) >= 5 && item.citedInStitchedDraft).length,
  relevantSupplementsDiscussedButNotInserted: supplements.filter(item => Number(item.number) >= 5 && !item.citedInStitchedDraft && draft.includes(`补${item.number}`)).length,
  originalImagesSpotCheckedAtLeastOnce: visualReviewNumbers.length,
  suspectedGapMarkers: (draft.match(/⟦疑似缺失/g) ?? []).length,
  uncertaintyMarkers: (draft.match(/⟦待确认/g) ?? []).length,
  unreadableMarkers: (draft.match(/\[看不清/g) ?? []).length,
  reportMentionsAuthorDecisions: review.includes('第一轮裁定记录'),
  issues,
};
const legacy182Crosswalk = [
  ...originals.map(item => ({ legacy182Number: item.old182Number, originalNumber: item.number,
    originalSourceId: item.sourceId, legacyOcrId: item.oldOcrId, status: 'mapped_worldbook_source' })),
  ...deleted.map(item => ({ legacy182Number: item.old182Number, originalSourceId: item.sourceId,
    legacyOcrId: oldIdFor(item.sourceId), status: 'user_excluded' })),
].sort((a, b) => a.legacy182Number - b.legacy182Number);
if (legacy182Crosswalk.length !== 182 || legacy182Crosswalk.some((item, index) => item.legacy182Number !== index + 1)) {
  issues.push('Legacy 182 sequence is not a complete one-to-one numbered crosswalk');
}
const audit = { schemaVersion: 1, summary, originals, supplements, userExcludedOldRecords: deleted, aliasMappings, legacy182Crosswalk,
  visualReviewNumbers, priorReportVisualReviewNumbers, thisPassSpotCheckNumbers };
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'source-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
await writeFile(join(outputDir, 'source-audit.md'), [
  '# 九霄世界书来源接收与拼接覆盖自检',
  '',
  '> 自动检查文件、编号和拼接稿引用；**不等于人工逐字比对原图或作者终审**。',
  '',
  `- 旧 OCR 记录：${summary.oldOcrRecords}；映射到现存原批：${summary.mappedOriginals}；用户排除：${summary.userExcludedOldRecords}。`,
  `- 原批图文成对存在：${summary.originalPairsPresent}/179；拼接稿引用：${summary.originalCitationsFound}/179。`,
  `- 补图图文成对存在：${summary.supplementPairsPresent}/28；相关补图进入正文：${summary.relevantSupplementCitationsFound}/24；仅作版本佐证：${summary.relevantSupplementsDiscussedButNotInserted}/24。`,
  `- 编号映射中的重复截图 UUID：${summary.duplicateImageAliasesReconciled} 处，已按旧 OCR 自带的 duplicates 对照表匹配，未视为新增原文。`,
  `- 原图至少局部视觉复核：${summary.originalImagesSpotCheckedAtLeastOnce}/179（旧报告 ${priorReportVisualReviewNumbers.length} 张，本轮另看 ${thisPassSpotCheckNumbers.filter(n => !priorReportVisualReviewNumbers.includes(n)).length} 张）。`,
  `- 拼接稿标记：疑似缺失 ${summary.suspectedGapMarkers}、待确认 ${summary.uncertaintyMarkers}、看不清 ${summary.unreadableMarkers}（含说明文字中的重复提及）。`,
  '',
  '## 自动检查问题',
  ...(issues.length ? issues.map(issue => `- ${issue}`) : ['- 编号、成对文件与来源引用检查无异常。']),
  '',
  '## 权限与边界',
  '',
  '原图、逐图文字和哈希明细保存在私有审核目录，不复制进玩家包。作者裁定、缺失内容和全文图文一致性仍需单独核验。',
  '',
].join('\n'));
console.log(JSON.stringify(summary, null, 2));
if (issues.length) process.exitCode = 1;
