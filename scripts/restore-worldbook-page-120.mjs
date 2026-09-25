import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) {
  throw new Error('Usage: node scripts/restore-worldbook-page-120.mjs <private-source-dir> <private-output-dir>');
}
const sourceDir = resolve(sourceArgument);
const outputDir = resolve(outputArgument);
const original = await readFile(join(sourceDir, '世界书_拼接初稿.md'), 'utf8');
const start = '万兽山庄的传承核心，在于如何与异兽沟通、共鸣，并最终将它们的力量';
const end = '### 主要分支 (地阶功法)';
const startIndex = original.indexOf(start);
const endIndex = original.indexOf(end, startIndex);
if (startIndex < 0 || endIndex < 0 || original.indexOf(start, startIndex + 1) >= 0) {
  throw new Error('Expected one Wan Shou cultivation span');
}
const existing = original.slice(startIndex, endIndex);
if (existing.includes('《万兽洪荒经》') || !existing.includes('【来源：119】')) {
  throw new Error('Source span changed; inspect before restoring');
}
const restored = [
  '万兽山庄的传承核心，在于如何与异兽沟通、共鸣，并最终将它们的力量',
  '⟦疑似缺失：功法体系引言末尾；119 页在“力量”处截断⟧',
  '',
  '【来源：119】',
  '',
  '#### 核心总纲',
  '',
  '##### ▪ 《万兽洪荒经》 - 天阶中品',
  '',
  '▪ 描述: 此功法并非记载于书卷，而是历代合体境太上老祖将自身与本命神兽的“魂印”烙印在山庄禁地“兽神殿”的一尊远古兽骨之上。唯有庄主与被选定的继承人，才有资格进入兽神殿，以神魂沟通兽骨，感悟其中蕴含的驭使万兽、熔炼洪荒血脉的无上法门。',
  '▪ 特点: 修炼此经，不仅能与妖兽建立更深层次的灵魂链接，更能逐步引导妖兽体内的上古血脉',
  '⟦疑似缺失：《万兽洪荒经》特点中段；120 页在“上古血脉”处截断⟧',
  '',
  '【来源：120】',
  '',
  '[看不清]己身，最终达到"人兽合一"，身化洪荒巨兽的至高境界。',
  '',
  '【来源：118】',
  '',
].join('\n');
const candidate = original.slice(0, startIndex) + restored + original.slice(endIndex);
await mkdir(outputDir, { recursive: true });
const path = join(outputDir, '世界书_拼接修订候选.md');
await writeFile(path, candidate, 'utf8');
console.log(path);
