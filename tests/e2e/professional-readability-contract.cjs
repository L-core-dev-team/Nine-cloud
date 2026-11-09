const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// The old d73e0b7 baseline remains authoritative for every other property.
// Apply only the explicit 2026-10-10 limited-authority delta over that baseline.
const approvedFooterClearance = new Set([
  'calc(225px + env(safe-area-inset-bottom))',
  'calc(var(--jx-ai-actionbar-clearance) + env(safe-area-inset-bottom))',
]);

function authorizedProfessionalCss(root) {
  const tokens = readFileSync(join(root, 'apps/web/src/design-system/tokens.css'), 'utf8');
  const tokenValues = [...tokens.matchAll(/--jx-ai-actionbar-clearance\s*:\s*([^;]+);/g)].map(match => match[1].trim());
  assert.deepEqual(tokenValues, ['225px'], 'The operation-bar clearance token must remain the approved 225px');
  const css = readFileSync(join(root, 'apps/web/src/style.css'), 'utf8');
  assert.equal([...css.matchAll(/--jx-ai-actionbar-clearance\s*:/g)].length, 0, 'style.css must consume the clearance token without overriding it');
  const start = '/* S-FINAL-CLOSEOUT professional readability start.';
  const end = '/* S-FINAL-CLOSEOUT professional readability end. */';
  const startAt = css.indexOf(start), endAt = css.indexOf(end);
  assert.ok(startAt >= 0 && endAt > startAt, 'The authorized professional delta must be explicitly delimited');
  const delta = css.slice(startAt, endAt + end.length);
  const stripped = delta.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!stripped.includes('@'), 'No layout or breakpoint rules in the professional readability delta');
  const allowed = new Set(['--muted', '--line', 'color', 'background', 'background-color', 'border-color', 'outline-color', 'font-size', 'line-height', 'opacity', 'padding-bottom']);
  let ruleCount = 0;
  let footerClearanceCount = 0;
  for (const [, selector, declarations] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    ruleCount++;
    for (const declaration of declarations.split(';').filter(s => s.trim())) {
      const colon = declaration.indexOf(':');
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      assert.ok(allowed.has(property), `Professional delta cannot alter ${property}`);
      assert.ok(!/url\(|!important/i.test(value), 'Professional delta cannot replace assets or override the cascade indiscriminately');
      if (property === 'opacity') assert.ok(/:disabled|::placeholder/.test(selector) && value === '1', 'Only restore readable disabled/placeholder foreground opacity');
      if (property === 'padding-bottom') {
        footerClearanceCount += 1;
        assert.equal(selector.trim(), 'body:has(.ai-page) .jx-shell > footer', 'Only reserve the existing operation-bar clearance below the legal links');
        assert.ok(approvedFooterClearance.has(value), 'Footer clearance must stay equivalent to calc(225px + env(safe-area-inset-bottom))');
      }
    }
  }
  assert.equal(footerClearanceCount, 1, 'The professional delta reserves footer clearance in exactly one rule');
  assert.ok(ruleCount > 0);
  return delta;
}

module.exports = { authorizedProfessionalCss };
