const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = process.argv[2] || path.resolve(__dirname, '../..');
const target = 'apps/web/public/favicon.svg';
function git(args, raw = false) {
  const result = spawnSync('git', args, { cwd: root, windowsHide: true, ...(raw ? {} : { encoding: 'utf8' }) });
  assert.equal(result.status, 0, result.stderr.toString());
  return raw ? result.stdout : result.stdout.trim();
}
const blob = git(['show', 'HEAD:' + target], true);
const checkout = fs.readFileSync(path.join(root, target));
const manifestBytes = fs.readFileSync(path.join(root, 'apps/web/public/scenes/candidate/asset-manifest.json'));
const expected = JSON.parse(manifestBytes).files.find(file => file.path === '/favicon.svg').sha256;
const fingerprint = bytes => ({ sha256: createHash('sha256').update(bytes).digest('hex'), length: bytes.length, crlf: (bytes.toString().match(/\r\n/g) || []).length, lf: (bytes.toString().match(/\n/g) || []).length });
const result = {
  head: git(['rev-parse', 'HEAD']), root, target, expected, blob: fingerprint(blob), checkout: fingerprint(checkout),
  sameBytes: blob.equals(checkout), attributes: git(['check-attr', 'text', 'eol', '--', target, 'apps/web/public/unrelated.svg']),
  conversionConfig: git(['config', '--show-origin', '--get', 'core.autocrlf']),
  manifestBlob: git(['rev-parse', 'HEAD:apps/web/public/scenes/candidate/asset-manifest.json']),
};
const output = process.env.JX_E2E_OUTPUT_DIR || path.join(root, 'test-results/e2e');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'favicon-byte-stability.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
assert.equal(result.blob.sha256, expected, 'authoritative hash must describe original Git bytes');
assert.ok(result.sameBytes, 'fresh Windows checkout must preserve original Git bytes');
assert.equal(result.checkout.sha256, expected, 'checkout must satisfy the unchanged media hash');
assert.ok(result.attributes.includes(target + ': text: unset'), 'only the hashed favicon needs byte-preserving -text');
assert.ok(result.attributes.includes('apps/web/public/unrelated.svg: text: unspecified'), 'unrelated SVG attributes must remain unchanged');
console.log('Favicon original bytes, precise attributes and unchanged authoritative hash: PASS');
