import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanArtifacts } from './artifact-scan.mjs';

const root = mkdtempSync(join(tmpdir(), 'jiuxiao-artifact-scan-'));
const codes = directory => scanArtifacts([directory]).findings.map(finding => `${finding.code}:${finding.path}`);
mkdirSync(join(root, 'assets'), { recursive: true });
mkdirSync(join(root, 'scenes'), { recursive: true });
mkdirSync(join(root, 'leaked', 'node_modules', '@jiuxiao', 'scene-gate'), { recursive: true });

// A scene experiment package leaking by path must fail the scan.
writeFileSync(join(root, 'assets', 'scene-studio-chunk.js'), 'export {};\n');
assert.ok(codes(root).some(code => code.startsWith('SCENE_PACKAGE_IN_ARTIFACTS:assets/scene-studio-chunk.js')));
writeFileSync(join(root, 'leaked', 'node_modules', '@jiuxiao', 'scene-gate', 'index.js'), 'export {};\n');
assert.ok(codes(root).some(code => code.startsWith('SCENE_PACKAGE_IN_ARTIFACTS:leaked/node_modules/@jiuxiao/scene-gate/index.js')));

// Bundled three.js library features and package-name bytes in content must fail the scan.
writeFileSync(join(root, 'assets', 'vendor-chunk.js'), 'import"./three.core-9f2a1b3c.js";import"./three.module-51c8de07.js";\n');
assert.ok(codes(root).some(code => code.startsWith('SCENE_CODE_IN_ARTIFACTS:assets/vendor-chunk.js')));
writeFileSync(join(root, 'assets', 'app.js'), 'import { gate } from "@jiuxiao/scene-gate";\n');
assert.ok(codes(root).some(code => code.startsWith('SCENE_CODE_IN_ARTIFACTS:assets/app.js')));

// Filename whitelist: mountain-gate candidate media stays quiet at the filename level…
writeFileSync(join(root, 'scenes', 'mountain-gate.scene-studio.export.webp'), 'synthetic candidate media bytes\n');
assert.ok(!codes(root).some(code => code.includes('mountain-gate.scene-studio.export.webp')));
// …but its content stays scanned and voids the whitelist once package bytes appear.
writeFileSync(join(root, 'scenes', 'mountain-gate.scene-studio.export.webp'), 'referencing @jiuxiao/scene-studio internals\n');
assert.ok(codes(root).some(code => code.startsWith('SCENE_PACKAGE_IN_ARTIFACTS:scenes/mountain-gate.scene-studio.export.webp')));
assert.ok(codes(root).some(code => code.startsWith('SCENE_CODE_IN_ARTIFACTS:scenes/mountain-gate.scene-studio.export.webp')));
// The whitelist never shields a mountain-gate file inside a leaked package directory.
writeFileSync(join(root, 'leaked', 'node_modules', '@jiuxiao', 'scene-gate', 'mountain-gate.webp'), 'synthetic\n');
assert.ok(codes(root).some(code => code.startsWith('SCENE_PACKAGE_IN_ARTIFACTS:leaked/node_modules/@jiuxiao/scene-gate/mountain-gate.webp')));

// Clean artifacts pass with exact statistics.
const clean = mkdtempSync(join(tmpdir(), 'jiuxiao-artifact-clean-'));
mkdirSync(join(clean, 'assets'), { recursive: true });
mkdirSync(join(clean, 'scenes'), { recursive: true });
writeFileSync(join(clean, 'index.html'), '<html></html>\n');
writeFileSync(join(clean, 'assets', 'index.js'), 'console.log("jiuxiao");\n');
writeFileSync(join(clean, 'scenes', 'mountain-gate.loop.mp4'), 'synthetic candidate media bytes\n');
const report = scanArtifacts([clean]);
assert.equal(report.findings.length, 0);
assert.equal(report.filesScanned, 3);
assert.ok(report.bytesScanned > 0);

// Release leak scan (governance §5.2): each class fails on its own file.
const leaks = mkdtempSync(join(tmpdir(), 'jiuxiao-artifact-leaks-'));
mkdirSync(join(leaks, 'assets'), { recursive: true });
const leakOptions = {
  envKeys: new Set(['AUTH_SECRET', 'DATABASE_URL', 'VITE_PUBLIC_FLAG']),
  allowlist: { emails: new Set(['public@example.org']), phones: new Set(['13800138000']), envKeys: new Set(['VITE_PUBLIC_FLAG']) },
};
const leakCodes = () => scanArtifacts([leaks], leakOptions).findings.map(finding => `${finding.code}:${finding.path}`);
const expectLeak = (file, content, code) => {
  writeFileSync(join(leaks, file), content);
  assert.ok(leakCodes().includes(`${code}:${file}`), `${file} should raise ${code}`);
  rmSync(join(leaks, file));
};
expectLeak('assets/posix.js', 'const p="/home/runner/work/app/src/a.ts";', 'LOCAL_PATH_IN_ARTIFACTS');
expectLeak('assets/mac.js', 'sourceRoot:"/Users/someone/project"', 'LOCAL_PATH_IN_ARTIFACTS');
expectLeak('assets/win.js', 'const p="C:\\\\Users\\\\someone\\\\app";', 'LOCAL_PATH_IN_ARTIFACTS');
expectLeak('assets/drive.json', '{"file":"D:\\\\九霄 WEB\\\\apps\\\\web"}', 'LOCAL_PATH_IN_ARTIFACTS');
expectLeak('assets/file-url.js', 'import("file:///D:/repo/x.js")', 'LOCAL_PATH_IN_ARTIFACTS');
expectLeak('scenes-poster.webp', Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.from('exif:C:\\Users\\author\\Pictures')]), 'LOCAL_PATH_IN_ARTIFACTS');
expectLeak('assets/worldbook.js', 'const dir="outputs/九霄WEB-1.0/世界书截图/";', 'PRIVATE_WORLDBOOK_IN_ARTIFACTS');
expectLeak('assets/ocr.json', '{"image":"原052.png"}', 'PRIVATE_WORLDBOOK_IN_ARTIFACTS');
expectLeak('assets/registry.json', '{"entries":[{"sourceRefs":["src_1"]}]}', 'PRIVATE_WORLDBOOK_IN_ARTIFACTS');
expectLeak('assets/env.js', 'console.log(process.env.AUTH_SECRET)', 'ENV_KEY_IN_ARTIFACTS');
expectLeak('assets/vite.js', 'const k="VITE_PRIVATE_THING";', 'ENV_KEY_IN_ARTIFACTS');
expectLeak('assets/secret-name.js', 'const k="STRIPE_SECRET_KEY";', 'ENV_KEY_IN_ARTIFACTS');
expectLeak('privacy.html', '<p>联系 someone.private@example.com</p>', 'PII_EMAIL_IN_ARTIFACTS');
expectLeak('assets/phone.js', 'const tel="+86 139-1234-5678";', 'PII_PHONE_IN_ARTIFACTS');
// Findings never echo the full personal value into CI logs.
writeFileSync(join(leaks, 'contact.html'), 'mail someone.private@example.com or 13912345678');
const masked = scanArtifacts([leaks], leakOptions).findings.map(finding => finding.detail).join(' ');
assert.doesNotMatch(masked, /someone\.private|13912345678/);
rmSync(join(leaks, 'contact.html'));
// Reviewed allowlist values, registered public env names, URL paths, error-code
// constants and random font bytes stay quiet.
writeFileSync(join(leaks, 'feedback.html'), '<a href="mailto:public@example.org">public@example.org</a> 例如 +8613800138000');
writeFileSync(join(leaks, 'assets', 'ok.js'), 'fetch("https://example.org/home/feed");const e="AUTH_REQUIRED",f="VITE_PUBLIC_FLAG",t=1700000000000;const r=x?B:/\\d+/;');
writeFileSync(join(leaks, 'assets', 'font.woff2'), Buffer.from('wOF2\u0000B@Iz.kg D:\\x A:/ 13912345678', 'latin1'));
const quiet = scanArtifacts([leaks], leakOptions);
assert.deepEqual(quiet.findings, []);
assert.deepEqual(quiet.allowlisted, ['email:public@example.org', 'phone:13800138000']);
// The committed allowlist must give every exemption a reason.
const badAllowlist = join(leaks, 'bad-allowlist.json');
writeFileSync(badAllowlist, JSON.stringify({ schemaVersion: 1, emails: [{ value: 'x@example.org' }] }));
assert.throws(() => scanArtifacts([clean], { allowlistPath: badAllowlist }), /needs a value and a reason/);
rmSync(leaks, { recursive: true, force: true });

rmSync(root, { recursive: true, force: true });
rmSync(clean, { recursive: true, force: true });
console.log('Artifact scan gate: leaked package paths, three.js chunks and package-name bytes refused; mountain-gate media whitelisted by filename only; local paths, private worldbook names, env key names and PII refused with masked output; reviewed allowlist honoured; clean artifacts passed with exact statistics.');
