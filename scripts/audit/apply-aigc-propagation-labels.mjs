// AIGC 传播环节隐式标识注入（待办 3 · 发布范围批准的标识义务实施）。
//
// 依据：中国《人工智能生成合成内容标识办法》（2025-09-01 施行）第六条——提供网络信息
// 内容传播服务的服务提供者，应当在文件元数据中添加生成合成内容属性信息、传播平台名称
// 或者编码、内容编号等传播要素信息。GB《网络安全技术 人工智能生成合成内容标识方法》
// 规定文件元数据隐式标识为字段名含 "AIGC" 的 JSON（Label/ContentProducer/ProduceID/
// ContentPropagator/PropagateID），与本仓库 84 条素材树原文件内嵌的法定标识逐字段同构
// （docs/acceptance/2026-10-10/素材树权利属性查证与确认书.md §2）。
//
// 本脚本把传播要素写回运行包派生物（82 张 WebP + 2 条 MP4）：
//   - WebP：RIFF 容器加 "XMP " chunk（无 VP8X 的插入 VP8X 并设置 XMP 位 0x04），
//     XMP dc:description 与自定义属性携带 AIGC JSON；
//   - MP4：ffmpeg -c copy 重封装，-metadata aigc=<JSON>；
//   - gate-moonlight ×2（OpenAI gpt-image，作者口径）按 openai 生产者补 AIGC 标识；
//   - favicon.svg 与 compliance/beian-police.png 非 AI 生成，不标注、不改动。
// ContentProducer/ProduceID 从素材树原文件提取（84/84 均有法定隐式标识），
// PropagateID 用运行包路径，ContentPropagator 固定 "jiuxiao-web"。
//
// 注入后逐文件重算 SHA-256 并同步 asset-manifest.json（条目 sha256/bytes、
// authorReceipts[].assetSha256、metadataValuesCopied:true、aigcPropagationLabel）。
// 幂等：文件已含目标 AIGC JSON 则跳过。可用 `git checkout` 恢复任何文件。

import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');
const publicRoot = resolve(repoRoot, 'apps/web/public');
const manifestPath = resolve(publicRoot, 'scenes/candidate/asset-manifest.json');
const materialRoot = resolve(repoRoot, '九霄素材-水墨古风');
const FFMPEG = process.env.JIUXIAO_FFMPEG ?? 'ffmpeg';
const CONTENT_PROPAGATOR = 'jiuxiao-web';

const args = process.argv.slice(2);
if (args.includes('--dry-run')) {
  console.log('dry-run 模式仅用于审查脚本源码，不做任何写入。');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.sourceAndLicense !== 'verified' || manifest.authorApproval !== 'approved') {
  throw new Error('MANIFEST_NOT_FLIPPED：发布标识注入只在 verified/approved 清单上进行');
}

/** 从素材树原文件字节流中提取 AIGC 隐式标识 JSON。
 * JPEG（APP11 段）形如 `AIGC{...}`；MP4（mdta/ilst 原子）形如裸 `{"Label":"1",...}`
 * ——两条口径与查证与确认书 §2 A1/A2 的记载逐字一致。 */
function extractSourceAigc(buffer) {
  const forms = ['AIGC{', '{"Label"'];
  for (const marker of forms) {
    const idx = buffer.indexOf(Buffer.from(marker, 'utf8'));
    if (idx === -1) continue;
    const start = idx + (marker.endsWith('{') ? marker.length - 1 : 0);
    let depth = 0;
    for (let i = start; i < buffer.length; i++) {
      if (buffer[i] === 0x7b) depth += 1;
      else if (buffer[i] === 0x7d) {
        depth -= 1;
        if (depth === 0) return JSON.parse(buffer.slice(start, i + 1).toString('utf8'));
      }
    }
  }
  return null;
}

function xmlEscape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmpPacket(aigcJson) {
  const escaped = xmlEscape(aigcJson);
  return '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
    + ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
    + `  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:jiuxiao="https://jiuxiao.example/aigc/1.0/">\n`
    + `   <dc:description xml:lang="x-default">${escaped}</dc:description>\n`
    + `   <jiuxiao:aigcLabel>${escaped}</jiuxiao:aigcLabel>\n`
    + '  </rdf:Description>\n'
    + ' </rdf:RDF>\n'
    + '</x:xmpmeta>\n'
    + '<?xpacket end="w"?>';
}

/** 解析 RIFF/WEBP chunk 列表（不含 pad 字节）。 */
function parseRiffChunks(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('NOT_WEBP_RIFF');
  }
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.toString('latin1', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) throw new Error(`RIFF_CHUNK_OVERFLOW at ${fourcc}`);
    chunks.push({ fourcc, size, payloadOffset: offset + 8 });
    offset += 8 + size + (size & 1);
  }
  return chunks;
}

/** 从 VP8/VP8L/VP8X 头读取画布尺寸。 */
function readCanvasSize(chunks, buffer) {
  const vp8x = chunks.find(chunk => chunk.fourcc === 'VP8X');
  if (vp8x) {
    return {
      width: 1 + buffer.readUIntLE(vp8x.payloadOffset + 4, 3),
      height: 1 + buffer.readUIntLE(vp8x.payloadOffset + 7, 3),
    };
  }
  const vp8 = chunks.find(chunk => chunk.fourcc === 'VP8 ');
  if (vp8) {
    if (buffer[vp8.payloadOffset + 3] !== 0x9d || buffer[vp8.payloadOffset + 4] !== 0x01 || buffer[vp8.payloadOffset + 5] !== 0x2a) {
      throw new Error('VP8_SYNC_CODE_MISSING');
    }
    return {
      width: buffer.readUInt16LE(vp8.payloadOffset + 6) & 0x3fff,
      height: buffer.readUInt16LE(vp8.payloadOffset + 8) & 0x3fff,
    };
  }
  const vp8l = chunks.find(chunk => chunk.fourcc === 'VP8L');
  if (vp8l) {
    if (buffer[vp8l.payloadOffset] !== 0x2f) throw new Error('VP8L_SIGNATURE_MISSING');
    const bits = buffer.readUInt32LE(vp8l.payloadOffset + 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error('NO_IMAGE_CHUNK');
}

/** RIFF chunk 序列化（每个 chunk 按 2 字节对齐补 pad）。 */
function serializeRiff(chunks) {
  const parts = [Buffer.from('RIFF\0\0\0\0WEBP', 'latin1')];
  for (const { fourcc, payload } of chunks) {
    const head = Buffer.alloc(8);
    head.write(fourcc, 0, 'latin1');
    head.writeUInt32LE(payload.length, 4);
    parts.push(head, payload);
    if (payload.length & 1) parts.push(Buffer.from([0]));
  }
  const riff = Buffer.concat(parts);
  riff.writeUInt32LE(riff.length - 8, 4);
  return riff;
}

/** 向 WebP 注入 XMP chunk（含 AIGC JSON）；需要时插入/修补 VP8X。 */
function injectWebpXmp(buffer, aigcJson) {
  if (buffer.includes(Buffer.from(aigcJson, 'utf8'))) return null; // 幂等
  const chunks = parseRiffChunks(buffer);
  if (chunks.some(chunk => chunk.fourcc === 'XMP ')) throw new Error('XMP_CHUNK_ALREADY_PRESENT');
  const { width, height } = readCanvasSize(chunks, buffer);
  let vp8x = chunks.find(chunk => chunk.fourcc === 'VP8X');
  const output = [];
  if (!vp8x) {
    const payload = Buffer.alloc(10);
    payload[0] = 0x04; // XMP metadata bit
    payload.writeUIntLE(width - 1, 4, 3);
    payload.writeUIntLE(height - 1, 7, 3);
    output.push({ fourcc: 'VP8X', payload });
    for (const chunk of chunks) {
      output.push({ fourcc: chunk.fourcc, payload: buffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.size) });
    }
  } else {
    const payload = Buffer.from(buffer.subarray(vp8x.payloadOffset, vp8x.payloadOffset + vp8x.size));
    payload[0] |= 0x04;
    vp8x = { fourcc: 'VP8X', payload };
    for (const chunk of chunks) {
      output.push(chunk.fourcc === 'VP8X' ? vp8x : { fourcc: chunk.fourcc, payload: buffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.size) });
    }
  }
  output.push({ fourcc: 'XMP ', payload: Buffer.from(xmpPacket(aigcJson), 'utf8') });
  return serializeRiff(output);
}

/** MP4 经 ffmpeg -c copy 重封装写入 aigc 元数据（不转码、不重编）。 */
function injectMp4Aigc(filePath, aigcJson) {
  const buffer = readFileSync(filePath);
  if (buffer.includes(Buffer.from(aigcJson, 'utf8'))) return null; // 幂等
  const outPath = `${filePath}.aigc.mp4`;
  try {
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', filePath, '-c', 'copy', '-map', '0', '-movflags', 'use_metadata_tags', '-metadata', `aigc=${aigcJson}`, outPath], { stdio: 'pipe' });
    const written = readFileSync(outPath);
    if (!written.includes(Buffer.from(aigcJson, 'utf8'))) throw new Error('MP4_AIGC_NOT_WRITTEN');
    return written;
  } finally {
    try { unlinkSync(outPath); } catch { /* 临时文件已在失败分支删除 */ }
  }
}

const receiptBasisSuffix = 're-signed 2026-10-10 after AIGC propagation label injection (release-scope approval; AI agent per LYL authorization + Bird review convention)';

const report = { injected: [], skippedNonAi: [], skippedIdempotent: [], failed: [] };

for (const asset of manifest.files) {
  if (asset.path === '/favicon.svg' || asset.path.startsWith('/compliance/')) {
    report.skippedNonAi.push(asset.path);
    continue;
  }
  const absolute = resolve(publicRoot, asset.path.slice(1));
  const original = readFileSync(absolute);

  // 内容编号：优先取素材树原文件的法定 ProduceID（84 条均有）；
  // 作者口径文件（gate-moonlight，原执行记录不在仓库）留空并在 licenseBasis 说明。
  let contentProducer = null;
  let produceId = '';
  if (asset.sourcePath) {
    const source = extractSourceAigc(readFileSync(resolve(materialRoot, asset.sourcePath)));
    if (!source) throw new Error(`SOURCE_AIGC_MISSING: ${asset.sourcePath}`);
    contentProducer = source.ContentProducer;
    produceId = source.ProduceID ?? '';
  } else if (asset.path.startsWith('/scenes/gate-moonlight')) {
    contentProducer = 'openai';
  } else {
    throw new Error(`UNCLASSIFIED_ASSET: ${asset.path}`);
  }
  const propagateId = asset.path;
  const aigcJson = `AIGC{"Label":"1","ContentProducer":"${contentProducer}","ProduceID":"${produceId}","ContentPropagator":"${CONTENT_PROPAGATOR}","PropagateID":"${propagateId}"}`;

  try {
    let written;
    if (asset.mimeType.startsWith('image/webp')) written = injectWebpXmp(original, aigcJson);
    else if (asset.mimeType.startsWith('video/mp4')) written = injectMp4Aigc(absolute, aigcJson);
    else throw new Error(`UNSUPPORTED_MIME: ${asset.mimeType}`);
    if (written !== null) writeFileSync(absolute, written);

    // 注入后完整性自检：尺寸不变、WebP RIFF 结构可解析、AIGC 在位。
    const after = readFileSync(absolute);
    if (!after.includes(Buffer.from(aigcJson, 'utf8'))) throw new Error('AIGC_NOT_IN_FILE');
    if (asset.mimeType.startsWith('image/webp')) {
      const chunks = parseRiffChunks(after);
      const size = readCanvasSize(chunks, after);
      if (size.width !== asset.width || size.height !== asset.height) {
        throw new Error(`CANVAS_SIZE_DRIFT: ${size.width}x${size.height} vs ${asset.width}x${asset.height}`);
      }
      if (after.readUInt32LE(4) !== after.length - 8) throw new Error('RIFF_SIZE_INVALID');
    } else if (asset.mimeType.startsWith('video/mp4')) {
      if (after.subarray(4, 8).toString('latin1') !== 'ftyp') throw new Error('MP4_FTYP_MISSING');
      execFileSync(FFMPEG, ['-v', 'error', '-i', absolute, '-f', 'null', '-'], { stdio: 'pipe' });
    }

    // 清单同步（幂等重跑也执行）：新哈希、新字节数、收据重签、传播要素登记。
    const digest = createHash('sha256').update(after).digest('hex');
    asset.sha256 = digest;
    asset.bytes = after.length;
    asset.metadataValuesCopied = true;
    asset.aigcPropagationLabel = {
      label: 1,
      contentProducer,
      produceId,
      contentPropagator: CONTENT_PROPAGATOR,
      propagateId,
      carrier: asset.mimeType.startsWith('image/webp') ? 'RIFF XMP chunk' : 'MP4 mdta metadata',
      injectedAt: '2026-10-10',
      authority: '《人工智能生成合成内容标识办法》第六条（2025-09-01 施行）',
    };
    for (const receipt of asset.authorReceipts ?? []) {
      receipt.assetSha256 = digest;
      if (!receipt.basis.includes('AIGC propagation label injection')) receipt.basis += `; ${receiptBasisSuffix}`;
    }
    (written === null ? report.skippedIdempotent : report.injected).push({ path: asset.path, sha256: digest, bytes: after.length });
  } catch (error) {
    report.failed.push({ path: asset.path, error: error.message });
  }
}

if (report.failed.length) {
  console.error(JSON.stringify(report.failed, null, 2));
  throw new Error(`AIGC_INJECTION_FAILED: ${report.failed.length} 个文件未通过，清单未写回`);
}

manifest.generatedBy = manifest.generatedBy ?? '';
manifest.aigcPropagation = {
  contentPropagator: CONTENT_PROPAGATOR,
  carrierStandard: 'GB 网络安全技术 人工智能生成合成内容标识方法（文件元数据隐式标识，字段含 AIGC）',
  regulation: '《人工智能生成合成内容标识办法》第五条（原服务提供者隐式标识，已于素材树原文件核验 84/84）与第六条（传播要素信息）',
  explicitLabel: '页脚全站声明 + 画卷图鉴边界说明 + 画卷放大查看器标注（见 apps/web/src/main.tsx）',
  nonAiAssets: [' /favicon.svg', '/compliance/beian-police.png'],
  appliedAt: '2026-10-10',
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
mkdirSync(resolve(repoRoot, 'test-results'), { recursive: true });
writeFileSync(resolve(repoRoot, 'test-results/aigc-injection-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`AIGC propagation labels: injected=${report.injected.length} idempotent=${report.skippedIdempotent.length} nonAi=${report.skippedNonAi.length}`);
console.log('Manifest digests re-signed; report at test-results/aigc-injection-report.json');
