import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AUTHOR_RULES_GATE } from './author-rules-gate.js';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';
import { loadTurnPlugin, prepareTurnRuntime, type TurnPlugin } from './turn-runtime.js';
import { computeRuleSemanticDigest } from './rule-semantic-fingerprint.js';
import { createP1RuleSemanticDependencies, type P1RuleSemanticInputSources } from './p1-rule-semantic-functions.js';
import { loadP1NluRuntime } from './p1-nlu-runtime.js';

/** A separately installed, hash-bound host approval promotes the signed opening
 * rules to the explicitly authorized 1.0 preview. The old review loader and its
 * production prohibition remain unchanged; missing/expired approval fails closed. */
export async function loadConfiguredTurnPlugin(env: NodeJS.ProcessEnv): Promise<TurnPlugin | undefined> {
  if (env.JIUXIAO_RELEASE_CHANNEL !== 'preview-1') return loadTurnPlugin(env.TURN_RULES_MODULE);
  if (!env.TURN_RULES_MODULE || !env.TURN_RULES_APPROVAL_PATH) return undefined;
  const pluginPath = env.TURN_RULES_MODULE, approvalPath = env.TURN_RULES_APPROVAL_PATH;
  if (![pluginPath, approvalPath].every(path => isAbsolute(path) && !/[\r\n\0]/.test(path)) || !/\.(mjs|js)$/.test(pluginPath)) throw new Error('PREVIEW_RULE_LOCAL_PATH_REQUIRED');
  const approvalBytes = await readFile(approvalPath);
  if (approvalBytes.length > 16384) throw new Error('PREVIEW_RULE_APPROVAL_INVALID');
  const approval = JSON.parse(approvalBytes.toString('utf8')) as Record<string, unknown>;
  if (approval.scope !== 'jiuxiao-preview-1-20261014'
    || !Array.isArray(approval.approvedBy) || !['LYL', 'Bird'].every(name => (approval.approvedBy as unknown[]).includes(name))
    || typeof approval.authorizationSource !== 'string' || !approval.authorizationSource.trim()
    || typeof approval.expiresAt !== 'string' || !(Date.parse(approval.expiresAt) > Date.now())
    || approval.semanticSha256 !== P1_REVIEW_RULE_APPROVAL.semanticSha256
    || AUTHOR_RULES_GATE.status !== 'APPROVED_BY_OWNER') throw new Error('PREVIEW_RULE_APPROVAL_INVALID');
  const actualHash = 'sha256:' + createHash('sha256').update(await readFile(pluginPath)).digest('hex');
  if (actualHash !== approval.pluginSha256) throw new Error('PREVIEW_RULE_PLUGIN_HASH_MISMATCH');
  const loaded = await import(pathToFileURL(pluginPath).href) as { default: TurnPlugin; P1_RULE_SEMANTIC_INPUTS?: P1RuleSemanticInputSources };
  if (!loaded.P1_RULE_SEMANTIC_INPUTS || !loaded.default?.rules) throw new Error('PREVIEW_RULE_SEMANTICS_MISSING');
  const fingerprintScript = resolve(fileURLToPath(new URL('../../../../scripts/p1-rule-semantic-source-digest.mjs', import.meta.url)));
  const source = spawnSync(process.execPath, [fingerprintScript], { encoding: 'utf8', windowsHide: true });
  if (source.status !== 0) throw new Error('PREVIEW_RULE_SOURCE_UNAVAILABLE');
  const implementationFingerprint = (JSON.parse(source.stdout) as {sha256:string}).sha256;
  const digest = computeRuleSemanticDigest(createP1RuleSemanticDependencies({ ...loaded.P1_RULE_SEMANTIC_INPUTS, implementationFingerprint }));
  const rule = loaded.default.rules;
  if (digest !== approval.semanticSha256 || rule.ruleVersion !== P1_REVIEW_RULE_APPROVAL.ruleVersion
    || rule.canonVersion !== P1_REVIEW_RULE_APPROVAL.canonVersion
    || rule.memoryPolicyVersion !== P1_REVIEW_RULE_APPROVAL.memoryPolicyVersion) throw new Error('PREVIEW_RULE_SEMANTIC_MISMATCH');
  const plugin = { ...loaded.default, ...await loadP1NluRuntime() };
  prepareTurnRuntime(plugin);
  console.info(JSON.stringify({ event: 'preview_rules_loaded', scope: approval.scope, pluginSha256: actualHash, semanticSha256: digest }));
  return plugin;
}
