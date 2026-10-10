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
rmSync(root, { recursive: true, force: true });
rmSync(clean, { recursive: true, force: true });
console.log('Artifact scan gate: leaked package paths, three.js chunks and package-name bytes refused; mountain-gate media whitelisted by filename only; clean artifacts passed with exact statistics.');
