const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const files = [
  'apps/web/src/design-system/tokens.css',
  'apps/web/src/pages/Landing/landing.css',
  'apps/web/src/style.css',
  'apps/web/src/components/liquid-glass.css',
  'apps/web/src/components/game-shell.css',
];
const requiredTokens = new Map([
  ['--jx-space-1', '4px'],
  ['--jx-space-2', '8px'],
  ['--jx-space-3', '12px'],
  ['--jx-space-4', '16px'],
  ['--jx-space-5', '24px'],
  ['--jx-space-6', '32px'],
  ['--jx-space-7', '48px'],
  ['--jx-space-8', '64px'],
  ['--jx-space-optical-1', '1px'],
  ['--jx-space-optical-2', '2px'],
  ['--jx-radius-small', '4px'],
  ['--jx-radius-control', '8px'],
  ['--jx-radius-card', '12px'],
  ['--jx-radius-panel', '16px'],
  ['--jx-radius-pill', '999px'],
  ['--jx-type-caption', '0.75rem'],
  ['--jx-type-small', '0.875rem'],
  ['--jx-type-body', '1rem'],
  ['--jx-type-lead', '1.125rem'],
  ['--jx-type-subhead', '1.25rem'],
  ['--jx-type-section', '1.5rem'],
  ['--jx-type-page', '2rem'],
  ['--jx-type-display', '2.5rem'],
]);

function maskFunction(value, functionName) {
  const needle = `${functionName}(`;
  let output = '';
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf(needle, cursor);
    if (start < 0) return output + value.slice(cursor);
    output += value.slice(cursor, start);
    let depth = 1;
    let end = start + needle.length;
    for (; end < value.length && depth > 0; end += 1) {
      if (value[end] === '(') depth += 1;
      if (value[end] === ')') depth -= 1;
    }
    output += ' '.repeat(Math.max(1, end - start));
    cursor = end;
  }
  return output;
}

function declarations(css) {
  const pattern = /(?:^|[;{}])\s*([\w-]+)\s*:\s*([^;{}]*)/g;
  const found = [];
  let match;
  while ((match = pattern.exec(css))) {
    const property = match[1].toLowerCase();
    if (property.startsWith('--')) continue;
    const valueStart = match.index + match[0].lastIndexOf(match[2]);
    found.push({ property, value: match[2].trim(), offset: valueStart });
  }
  return found;
}

function lineAt(css, offset) {
  return css.slice(0, offset).split('\n').length;
}

const problems = [];
let checkedDeclarations = 0;

const tokenSource = fs.readFileSync(path.join(root, 'apps/web/src/design-system/tokens.css'), 'utf8');
for (const [name, expected] of requiredTokens) {
  const found = tokenSource.match(new RegExp(`${name}\\s*:\\s*([^;]+)`));
  if (!found || found[1].trim() !== expected) problems.push(`apps/web/src/design-system/tokens.css root token ${name} must equal ${expected}`);
}

for (const relative of files) {
  const absolute = path.join(root, relative);
  const raw = fs.readFileSync(absolute, 'utf8');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, ' '));
  for (const declaration of declarations(css)) {
    checkedDeclarations += 1;
    const { property, value, offset } = declaration;
    const line = lineAt(css, offset);
    const where = `${relative}:${line}`;

    if (property === 'font-size' || property === 'font') {
      const sizes = [...value.matchAll(/(?<![\w.-])(?:\d*\.)?\d+\s*(?:px|rem|em)(?![\w-])/gi)];
      for (const size of sizes) problems.push(`${where} ${property}: fixed type size ${size[0].trim()} must use a typography token`);
    }

    if (/^border-(?:(?:top|bottom)-(?:left|right)-)?radius$/.test(property)) {
      const radii = [...value.matchAll(/(?<![\w.-])(?:\d*\.)?\d+\s*(?:px|rem|em|%)(?![\w-])/gi)];
      for (const radius of radii) {
        const literal = radius[0].replace(/\s/g, '').toLowerCase();
        if (literal === '0px' || literal === '0rem' || literal === '0em' || literal === '0%' || literal === '50%') continue;
        problems.push(`${where} ${property}: ${radius[0].trim()} must use a radius token or the 50% circle exception`);
      }
    }

    if (/^(?:(?:scroll-)?(?:margin|padding)(?:-[\w-]+)?|gap|row-gap|column-gap)$/.test(property)) {
      const measured = maskFunction(value, 'clamp');
      const distances = [...measured.matchAll(/(?<![\w.-])-?(?:\d*\.)?\d+\s*(?:px|rem|em|vw|vh|%)(?![\w-])/gi)];
      for (const distance of distances) {
        const amount = Number.parseFloat(distance[0]);
        if (amount === 0) continue;
        problems.push(`${where} ${property}: fixed spacing ${distance[0].trim()} must use a spacing/semantic token or documented fluid clamp`);
      }
    }
  }
}

if (problems.length) {
  console.error(`Design token audit failed: ${problems.length} raw design values across ${checkedDeclarations} declarations.`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Design token audit passed: ${checkedDeclarations} product CSS declarations checked (typography, radii, spacing).`);
  console.log(`Scope: ${files.join(', ')}. The isolated liquid-glass demo has its own scene-local tokens and is excluded.`);
}
