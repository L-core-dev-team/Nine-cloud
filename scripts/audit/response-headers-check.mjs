#!/usr/bin/env node
// Static response-header policy check (governance §5.2): parses the production
// Caddyfile and the Cloudflare Pages `_headers` file and fails if a security
// header is missing, emptied or detached. Runtime behaviour of the same files is
// exercised by tests/integration/environment-runtime.mjs and test:pages-relay;
// this check is the cheap, always-on guard against a config edit dropping them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
export const REQUIRED_HEADERS = ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy'];
const WEAK_REFERRER = new Set(['unsafe-url', 'no-referrer-when-downgrade']);

/** Splits a Caddyfile into a block tree; quoted strings may contain spaces and braces. */
export function parseCaddyfile(source) {
  const rootNode = { tokens: [], children: [] };
  const stack = [rootNode];
  for (const rawLine of source.split(/\r?\n/)) {
    const tokens = [];
    let current = '';
    let quoted = false;
    let started = false;
    for (let index = 0; index < rawLine.length; index += 1) {
      const char = rawLine[index];
      if (quoted) {
        if (char === '\\' && rawLine[index + 1] === '"') { current += '"'; index += 1; continue; }
        if (char === '"') { quoted = false; continue; }
        current += char;
        continue;
      }
      if (char === '#' && !started) break;
      if (char === '"') { quoted = true; started = true; continue; }
      if (/\s/.test(char)) { if (started) { tokens.push(current); current = ''; started = false; } continue; }
      current += char;
      started = true;
    }
    if (quoted) throw new Error(`CADDYFILE_UNTERMINATED_QUOTE: ${rawLine.trim()}`);
    if (started) tokens.push(current);
    if (tokens.length === 0) continue;
    if (tokens.length === 1 && tokens[0] === '}') {
      if (stack.length === 1) throw new Error('CADDYFILE_UNBALANCED_BRACE');
      stack.pop();
      continue;
    }
    const opens = tokens.at(-1) === '{';
    const node = { tokens: opens ? tokens.slice(0, -1) : tokens, children: [] };
    stack.at(-1).children.push(node);
    if (opens) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('CADDYFILE_UNBALANCED_BRACE');
  return rootNode;
}

function headerValues(node) {
  // `header { Name value }` blocks; `header Name value` one-liners are also accepted.
  const values = new Map();
  const record = (name, value) => {
    const clean = name.replace(/^[>+?]/, '');
    // Caddy applies deletions after add/set, so a '-Name' op wins wherever it appears.
    if (name.startsWith('-')) values.set(name.slice(1).toLowerCase(), null);
    else if (values.get(clean.toLowerCase()) !== null) values.set(clean.toLowerCase(), value);
  };
  for (const child of node.children) {
    if (child.tokens[0] !== 'header') continue;
    if (child.tokens.length >= 2 && !child.tokens[1].startsWith('@') && child.children.length === 0) {
      record(child.tokens[1], child.tokens.slice(2).join(' '));
    }
    for (const line of child.children) record(line.tokens[0], line.tokens.slice(1).join(' '));
  }
  return values;
}

function checkValues(label, values, problems) {
  for (const name of REQUIRED_HEADERS) {
    const value = values.get(name.toLowerCase());
    if (value === undefined) problems.push(`${label}: missing ${name}`);
    else if (value === null) problems.push(`${label}: ${name} is removed`);
    else if (!value.trim()) problems.push(`${label}: ${name} is empty`);
  }
  const nosniff = values.get('x-content-type-options');
  if (nosniff && nosniff.trim().toLowerCase() !== 'nosniff') problems.push(`${label}: X-Content-Type-Options must be nosniff`);
  const referrer = values.get('referrer-policy');
  if (referrer && referrer.split(',').some(value => WEAK_REFERRER.has(value.trim().toLowerCase()))) problems.push(`${label}: Referrer-Policy leaks full URLs`);
  const csp = values.get('content-security-policy');
  if (csp && !/(?:^|;)\s*frame-ancestors\s/i.test(csp)) problems.push(`${label}: Content-Security-Policy must set frame-ancestors`);
}

export function checkCaddyfile(source, label = 'deployment/Caddyfile') {
  const problems = [];
  const tree = parseCaddyfile(source);
  const sites = tree.children.filter(node => node.children.length > 0 && node.tokens.length > 0 && !node.tokens[0].startsWith('('));
  const productionSites = sites.filter(node => node.tokens.some(token => /(?:^|\.)jiuxiaogame\.cn$/i.test(token.replace(/^https?:\/\//, '').replace(/:\d+$/, ''))));
  if (productionSites.length === 0) problems.push(`${label}: no production site block found`);
  for (const site of productionSites) {
    const siteLabel = `${label} ${site.tokens.join(' ')}`;
    checkValues(siteLabel, headerValues(site), problems);
    const errorBlocks = site.children.filter(node => node.tokens[0] === 'handle_errors');
    if (errorBlocks.length === 0) problems.push(`${siteLabel}: missing handle_errors block (edge errors would ship without security headers)`);
    for (const block of errorBlocks) checkValues(`${siteLabel} handle_errors`, headerValues(block), problems);
    if (/api\./i.test(site.tokens.join(' '))) {
      // Route A entry block (docs/acceptance/2026-10-11): the account-write matcher
      // must keep answering 404 at the edge until the documented lift procedure.
      const blocked = site.children.find(node => node.tokens[0] === '@blocked');
      const blockedPaths = blocked ? blocked.children.flatMap(node => node.tokens[0] === 'path' ? node.tokens.slice(1) : []) : [];
      for (const path of ['/api/auth/guest', '/api/auth/code', '/api/auth/refresh', '/api/auth/logout', '/api/auth/phone', '/api/account']) {
        if (!blockedPaths.includes(path)) problems.push(`${siteLabel}: Route A @blocked matcher no longer lists ${path}`);
      }
      if (!site.children.some(node => node.tokens.join(' ') === 'respond @blocked 404')) problems.push(`${siteLabel}: Route A @blocked paths no longer respond 404`);
    }
  }
  return problems;
}

/** Cloudflare Pages `_headers`: unindented URL patterns, indented `Name: value` lines, `! Name` detaches. */
export function parsePagesHeaders(source) {
  const rules = [];
  for (const rawLine of source.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) { rules.push({ pattern: rawLine.trim(), headers: new Map() }); continue; }
    const rule = rules.at(-1);
    if (!rule) throw new Error(`PAGES_HEADERS_ORPHAN_LINE: ${rawLine.trim()}`);
    const line = rawLine.trim();
    if (line.startsWith('!')) { rule.headers.set(line.slice(1).trim().toLowerCase(), null); continue; }
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error(`PAGES_HEADERS_MALFORMED: ${line}`);
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    rule.headers.set(name, rule.headers.has(name) && rule.headers.get(name) ? `${rule.headers.get(name)}, ${value}` : value);
  }
  return rules;
}

export function checkPagesHeaders(source, label = 'apps/web/public/_headers') {
  const problems = [];
  const rules = parsePagesHeaders(source);
  const global = rules.find(rule => rule.pattern === '/*');
  if (!global) problems.push(`${label}: missing the /* rule that covers every page`);
  else checkValues(`${label} /*`, global.headers, problems);
  for (const rule of rules) {
    for (const name of REQUIRED_HEADERS) {
      if (rule.headers.get(name.toLowerCase()) === null) problems.push(`${label} ${rule.pattern}: detaches ${name}`);
    }
  }
  return problems;
}

export function checkRepository() {
  return [
    ...checkCaddyfile(readFileSync(resolve(root, 'deployment/Caddyfile'), 'utf8')),
    ...checkPagesHeaders(readFileSync(resolve(root, 'apps/web/public/_headers'), 'utf8')),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const problems = checkRepository();
  for (const problem of problems) console.error(`HEADER_POLICY: ${problem}`);
  if (problems.length > 0) {
    console.error(`Response header check failed: ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Response header check passed: ${REQUIRED_HEADERS.join(', ')} present on the Caddy API site, its error handler and the Pages /* rule; Route A edge block intact.`);
  }
}
