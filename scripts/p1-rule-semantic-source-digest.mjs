import ts from 'typescript-compiler-api';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULE_SOURCE_FORMAT = 'jiuxiao-p1-runtime-ast-v2';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = [
  'apps/api/src/services/p1-memory-policy.ts',
  'apps/api/src/services/p1-nlu-runtime.ts',
  'apps/api/src/services/p1-prologue-plugin.ts',
  'apps/api/src/services/p1-rule-semantic-functions.ts',
  'apps/api/src/services/narrative-memory-context.ts',
  'apps/api/src/services/npc-memory-turn-transaction.ts',
  'apps/api/src/services/p1-review-semantic-gate.ts',
  'apps/api/src/services/rule-semantic-fingerprint.ts',
  'apps/api/src/services/server-turn.ts',
  'apps/api/src/services/turn-runtime.ts',
  'packages/contracts/src/action.ts',
  'packages/contracts/src/decision.ts',
  'packages/contracts/src/event.ts',
  'packages/contracts/src/index.ts',
  'packages/contracts/src/json-bounds.ts',
  'packages/contracts/src/prologue.ts',
  'packages/contracts/src/save.ts',
  'packages/contracts/src/state-delta.ts',
  'packages/contracts/src/turn.ts',
  'packages/contracts/src/world.ts',
  'packages/domain/src/index.ts',
  'packages/domain/src/event-log.ts',
  'packages/domain/src/memory/belief.ts',
  'packages/domain/src/memory/policy.ts',
  'packages/domain/src/memory/turn-journal.ts',
  'packages/domain/src/nlu/action-parser.ts',
  'packages/domain/src/nlu/index.ts',
  'packages/domain/src/nlu/prologue-v1-nlu-fixtures.ts',
  'packages/domain/src/prologue-v1-rules.ts',
  'packages/domain/src/prologue-v1-time.ts',
  'packages/domain/src/rules.ts',
  'packages/domain/src/state-delta.ts',
  'scripts/p1-rule-semantic-source-digest.mjs',
].sort();

const runtimePackages = [
  {
    path: 'packages/contracts/package.json',
    project: value => ({ type: value.type, exports: value.exports, dependencies: value.dependencies }),
  },
  {
    path: 'packages/domain/package.json',
    project: value => ({ type: value.type, exports: value.exports }),
  },
];

export function normalizeRuleSemanticSource(source, filePath) {
  if (filePath.endsWith('.json')) return canonicalJson(JSON.parse(source));
  const normalizedPath = filePath.replaceAll('\\', '/');
  const sourceFile = ts.createSourceFile(normalizedPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const transformer = context => rootNode => {
    const visit = node => {
      if (normalizedPath.endsWith('apps/api/src/services/p1-prologue-plugin.ts')
        && ts.isIfStatement(node)
        && containsSchemaVersionComparison(node.expression)
        && containsStringLiteral(node.thenStatement, 'P1_MEMORY_POLICY_MISMATCH')) {
        // Save-envelope compatibility guards do not change P1 rules or memory
        // authorization. Keep a null-save guard, but exclude V1/V2/V3 branches.
        if (containsNegatedSave(node.expression)) {
          return ts.factory.updateIfStatement(
            node,
            ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, ts.factory.createIdentifier('save')),
            node.thenStatement,
            node.elseStatement,
          );
        }
        return undefined;
      }
      if (normalizedPath.endsWith('packages/contracts/src/save.ts') && ts.isVariableStatement(node)) {
        const excluded = new Set(['SAVE_SCHEMA_VERSION', 'SaveEnvelopeV1Schema', 'SaveEnvelopeV2Schema', 'SaveEnvelopeV3Schema', 'SaveEnvelopeSchema']);
        const declarations = node.declarationList.declarations.filter(declaration =>
          !ts.isIdentifier(declaration.name) || !excluded.has(declaration.name.text));
        if (declarations.length === 0) return undefined;
        return ts.factory.updateVariableStatement(node, node.modifiers,
          ts.factory.updateVariableDeclarationList(node.declarationList, declarations));
      }
      if (normalizedPath.endsWith('packages/domain/src/nlu/action-parser.ts')
        && ts.isFunctionDeclaration(node)
        && (node.name?.text === 'unknownQuestion' || node.name?.text === 'questionForMissing')) {
        return undefined;
      }
      if (normalizedPath.endsWith('apps/api/src/services/p1-prologue-plugin.ts')
        && ts.isFunctionDeclaration(node)
        && ['renderDeterministicNarrative', 'deterministicTalkReply', 'textParagraphs', 'textArray'].includes(node.name?.text ?? '')) {
        return undefined;
      }
      if (normalizedPath.endsWith('apps/api/src/services/p1-prologue-plugin.ts')
        && ts.isPropertyAssignment(node)
        && propertyName(node.name) === 'narrativeFallback') {
        return undefined;
      }
      if (normalizedPath.endsWith('apps/api/src/services/p1-memory-policy.ts')
        && ts.isFunctionDeclaration(node)
        && node.name?.text === 'assertP1SaveMemoryPolicy') {
        return undefined;
      }
      if (normalizedPath.endsWith('packages/domain/src/nlu/action-parser.ts')
        && ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'clarify') {
        const args = [...node.arguments];
        if (args.length > 2) args[2] = ts.factory.createStringLiteral('__presentation_only__');
        if (args.length > 5) args[5] = ts.factory.createStringLiteral('__presentation_only__');
        return ts.visitEachChild(ts.factory.updateCallExpression(node, node.expression, node.typeArguments, args), visit, context);
      }
      if (normalizedPath.endsWith('packages/domain/src/prologue-v1-rules.ts')
        && ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        && isMessagesLookup(node.left)) {
        return ts.visitEachChild(
          ts.factory.updateBinaryExpression(node, node.left, node.operatorToken, ts.factory.createStringLiteral('__presentation_only__')),
          visit,
          context,
        );
      }
      if (normalizedPath.endsWith('packages/domain/src/prologue-v1-rules.ts')
        && ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)) {
        const codeArgumentIndex = node.expression.text === 'accepted' ? 1
          : ['reject', 'rejected'].includes(node.expression.text) ? 0 : -1;
        const args = [...node.arguments];
        if (codeArgumentIndex >= 0 && isRuleCode(args[codeArgumentIndex])) {
          args[codeArgumentIndex] = ts.factory.createStringLiteral('__error_code_label__');
          return ts.visitEachChild(ts.factory.updateCallExpression(node, node.expression, node.typeArguments, args), visit, context);
        }
      }
      if (ts.isNewExpression(node)
        && ts.isIdentifier(node.expression)
        && ['Error', 'TypeError', 'RangeError'].includes(node.expression.text)
        && node.arguments?.[0]
        && ts.isStringLiteral(node.arguments[0])) {
        const args = [...node.arguments];
        args[0] = ts.factory.createStringLiteral('__error_message__');
        return ts.visitEachChild(ts.factory.updateNewExpression(node, node.expression, node.typeArguments, args), visit, context);
      }
      if (filePath.startsWith('packages/contracts/src/')
        && ts.isPropertyAssignment(node)
        && propertyName(node.name) === 'message'
        && ts.isStringLiteral(node.initializer)) {
        return ts.factory.updatePropertyAssignment(node, node.name, ts.factory.createStringLiteral('__validation_message__'));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(rootNode, visit);
  };
  const result = ts.transpileModule(sourceFile.text, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      sourceMap: false,
      inlineSourceMap: false,
      inlineSources: false,
      importHelpers: false,
      verbatimModuleSyntax: false,
      newLine: ts.NewLineKind.LineFeed,
    },
    transformers: { before: [transformer] },
  });
  if (result.diagnostics?.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error(`RULE_SEMANTIC_SOURCE_PARSE_FAILED:${filePath}`);
  }
  const outputFile = ts.createSourceFile(`${normalizedPath}.js`, result.outputText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return canonicalJson(serializeSyntaxTree(outputFile));
}

export function computeRuleSemanticSourceDigest(repositoryRoot = root) {
  const manifest = files.map(path => {
    const absolutePath = resolve(repositoryRoot, path);
    const source = readFileSync(absolutePath, 'utf8');
    const normalized = normalizeRuleSemanticSource(source, path.replaceAll('\\', '/'));
    return {
      path,
      sha256: createHash('sha256').update(normalized, 'utf8').digest('hex'),
    };
  }).concat(runtimePackages.map(({ path, project }) => {
    const absolutePath = resolve(repositoryRoot, path);
    const value = JSON.parse(readFileSync(absolutePath, 'utf8'));
    const normalized = canonicalJson(project(value));
    return { path, sha256: createHash('sha256').update(normalized, 'utf8').digest('hex') };
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const input = `${RULE_SOURCE_FORMAT}\n${ts.version}\n${manifest.map(({ path, sha256 }) => `${path}\0${sha256}`).join('\n')}\n`;
  const sha256 = `sha256:${createHash('sha256').update(input, 'utf8').digest('hex')}`;
  return { format: RULE_SOURCE_FORMAT, typescriptVersion: ts.version, sha256, files: manifest };
}

function isMessagesLookup(node) {
  return (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'messages')
    || (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'messages');
}

function propertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

function isRuleCode(node) {
  return !!node && ts.isStringLiteral(node) && /^(?:INPUT|AUTH|ENV|RULE)_[A-Z0-9_]+$/.test(node.text);
}

function containsSchemaVersionComparison(node) {
  return containsNode(node, candidate => ts.isBinaryExpression(candidate)
    && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(candidate.operatorToken.kind)
    && (isSaveSchemaVersion(candidate.left) || isSaveSchemaVersion(candidate.right)));
}

function isSaveSchemaVersion(node) {
  return ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === 'save'
    && node.name.text === 'schemaVersion';
}

function containsNegatedSave(node) {
  return containsNode(node, candidate => ts.isPrefixUnaryExpression(candidate)
    && candidate.operator === ts.SyntaxKind.ExclamationToken
    && ts.isIdentifier(candidate.operand) && candidate.operand.text === 'save');
}

function containsStringLiteral(node, expected) {
  return containsNode(node, candidate => ts.isStringLiteralLike(candidate) && candidate.text === expected);
}

function containsNode(node, predicate) {
  if (predicate(node)) return true;
  let matched = false;
  ts.forEachChild(node, child => {
    if (!matched && containsNode(child, predicate)) matched = true;
  });
  return matched;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function serializeSyntaxTree(node) {
  const children = [];
  ts.forEachChild(node, child => { children.push(serializeSyntaxTree(child)); });
  const row = { kind: ts.SyntaxKind[node.kind], children };
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node)) {
    row.text = node.text;
    if (node.rawText && ts.isTemplateLiteralToken(node)) row.rawText = node.rawText;
  } else if (ts.isNumericLiteral(node)) {
    const numeric = Number(node.text.replaceAll('_', ''));
    row.text = Number.isFinite(numeric) ? JSON.stringify(numeric) : node.text;
  } else if (ts.isBigIntLiteral(node)) {
    row.text = `${BigInt(node.text.replaceAll('_', '').replace(/n$/i, '')).toString()}n`;
  }
  return row;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(computeRuleSemanticSourceDigest(), null, 2)}\n`);
  } catch {
    process.stderr.write('P1_RULE_SEMANTIC_SOURCE_UNAVAILABLE\n');
    process.exitCode = 1;
  }
}
