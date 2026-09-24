import { useEffect, useMemo, useRef, useState } from 'react';
import { catalogVerifiedOn, providerCatalog } from './ai-provider-catalog';

const CONFIG_KEY = 'jx10_ai_config_v2';
const LOG_KEY = 'jx10_ai_call_log_v1';
const LEGACY_MULTI_KEY = 'jx_ai_config';
const LEGACY_SINGLE_KEY = 'jx1_config';

const roleMeta = [
  { id: 'story', title: '主剧情', purpose: '把地点、行动和人物反应写成连贯正文。' },
  { id: 'director', title: '剧情导演', purpose: '梳理节奏、伏笔与分支，给主线提供候选建议。' },
  { id: 'stateManager', title: '状态与记忆', purpose: '提取状态变化与记忆候选；最终状态由规则确认。' },
  { id: 'archive', title: '世界档案', purpose: '整理已发生内容，供后续检索；不改写 Canon。' },
  { id: 'premiumDirector', title: '高级剧情', purpose: '留给重要转折、长篇场面等高要求段落。' },
] as const;

type RoleId = typeof roleMeta[number]['id'];
type RoleConfig = {
  enabled: boolean; model: string; baseUrl: string; adapter: 'openai-compatible';
  temperature: number; topP: number; topK: number; frequencyPenalty: number; presencePenalty: number;
  repetitionPenalty: number; seed: number | null; maxTokens: number; timeoutSeconds: number;
  contextWindowTokens: number; responseFormat: 'text' | 'json_object'; streaming: boolean;
  reasoningEffort: 'default' | 'low' | 'medium' | 'high'; stopSequences: string;
};
type AiConfig = {
  version: 3; roles: Record<RoleId, RoleConfig>; connectionTestAllowed: boolean;
  logRetentionDays: number; allowLegacyMigration: boolean; archiveInterval: number;
  contextCount: number; retryCount: number; retryDelaySeconds: number;
  activePresetId: string | null;
};
type CallLog = {
  at: string; role: string; model: string; elapsedMs: number; outcome: 'success' | 'failure';
  status?: number; inputTokens?: number; outputTokens?: number; errorCode?: string;
};
type Preset = { id: string; title: string; tone: string; detail: string; models: Record<RoleId, string>; providers: Record<RoleId, string>; reasons: Record<RoleId, string>; temperature: number; topP: number; maxTokens: number };

const providerDefaults: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  ark: 'https://ark.cn-beijing.volces.com/api/v3',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
};
const presets: Preset[] = [
  {
    id: 'mist', title: '疏影 · 省用', tone: '把常用岗位放在轻量价位；高级剧情默认关闭。',
    detail: '主线与档案用 DeepSeek Flash，状态整理用通义千问 Flash；高级剧情预填豆包 Seed Pro，但默认停用。', temperature: 0.72, topP: 0.9, maxTokens: 2048,
    models: { story: 'deepseek-flash', director: 'qwen3.8-flash', stateManager: 'qwen3.8-flash', archive: 'deepseek-flash', premiumDirector: 'doubao-seed-2-1-pro-260915' },
    providers: { story: 'deepseek', director: 'aliyun', stateManager: 'aliyun', archive: 'deepseek', premiumDirector: 'ark' },
    reasons: { story: '主线按实际预算选择低价文本模型；可用自己的剧情样本复核文风。', director: '常规节奏检查使用千问 Flash，减少高频调用的单价。', stateManager: '状态抽取偏结构化、重复调用多，选千问 Flash。', archive: '档案候选以归纳为主，先压低整理成本。', premiumDirector: '预填官方目录中的现行豆包 Seed Pro ID，但默认关闭，避免闲置扣费。' },
  },
  {
    id: 'balanced', title: '行云 · 合宜', tone: '把预算留给正文和关键判断，整理岗位用轻量型号。',
    detail: '主剧情用 DeepSeek V4 Pro，导演用豆包 Seed Pro；状态和档案分别用通义千问 Flash、DeepSeek Flash。', temperature: 0.78, topP: 0.92, maxTokens: 4096,
    models: { story: 'deepseek-v4-pro', director: 'doubao-seed-2-1-pro-260915', stateManager: 'qwen3.8-flash', archive: 'deepseek-flash', premiumDirector: 'doubao-seed-2-1-pro-260915' },
    providers: { story: 'deepseek', director: 'ark', stateManager: 'aliyun', archive: 'deepseek', premiumDirector: 'ark' },
    reasons: { story: 'DeepSeek V4 Pro 官方价按峰谷时段浮动；长篇表现仍需用九霄样本盲测。', director: '豆包 Seed Pro 适合复杂规划候选；费用高于轻量档，按需保留。', stateManager: '结构化重复任务采用低价 Flash。', archive: '归档时重在压缩与检索线索，避免占用高阶预算。', premiumDirector: '预填强档但默认关闭；只有启用并实际调用时才会产生费用。' },
  },
  {
    id: 'longform', title: '长歌 · 旗舰', tone: '预算不设上限；五个岗位都用旗舰候选，按职责分别设定。',
    detail: '五席统一预填 GPT‑6 Astra：正文负责叙事，导演负责结构，状态岗位输出结构化结果，档案负责长线整理，高级剧情留作手动启用。', temperature: 0.7, topP: 1, maxTokens: 8192,
    models: { story: 'gpt-6-astra', director: 'gpt-6-astra', stateManager: 'gpt-6-astra', archive: 'gpt-6-astra', premiumDirector: 'gpt-6-astra' },
    providers: { story: 'openai', director: 'openai', stateManager: 'openai', archive: 'openai', premiumDirector: 'openai' },
    reasons: { story: '为正文留出最高档的推理与输出预算；文风仍需用九霄剧情样本盲测。', director: '用同一旗舰候选检查章节结构、伏笔与转场；提示词按导演职责配置。', stateManager: '适合尝试结构化状态提取；结算规则仍由九霄代码执行。', archive: '长线材料整理可用长上下文能力；实际输入量会显著影响费用。', premiumDirector: '重点场面单独启用；不开启时不会安排该岗位调用。' },
  },
];

type CompareModel = { name: string; provider: string; input: string; output: string; context: string; use: string; source: string; compatible: boolean };
const comparisonModels: CompareModel[] = [
  { name: 'Claude Opus 4.6', provider: 'Anthropic', input: '$5 / MTok', output: '$25 / MTok', context: '1M（官方）', use: '高复杂度长文候选；原生 API 尚未适配。', source: 'https://platform.claude.com/docs/en/about-claude/pricing', compatible: false },
  { name: 'Gemini 3.8 Flash', provider: 'Google', input: '$0.75 / MTok*', output: '$3.75 / MTok*', context: '见官方型号页', use: '高吞吐与多模态候选；星号价格为限时标准价。', source: 'https://ai.google.dev/gemini-api/docs/pricing', compatible: false },
  { name: 'GPT-6 Astra', provider: 'OpenAI', input: '$10 / MTok', output: '$50 / MTok', context: '1.05M（官方）', use: '复杂任务旗舰候选；费用高，建议先做固定样本盲测。', source: 'https://developers.openai.com/api/docs/pricing', compatible: true },
  { name: 'Kimi K3', provider: '月之暗面', input: '$3 / MTok', output: '$15 / MTok', context: '1M（官方）', use: '长上下文候选；长输入会增加总费用。', source: 'https://platform.kimi.ai/zh-hans', compatible: true },
  { name: 'Qwen 3.8 Max', provider: '阿里云百炼', input: '¥12 / MTok', output: '¥36 / MTok', context: '1M（官方）', use: '复杂中文任务候选；标准价按输入输出分开计费。', source: 'https://help.aliyun.com/zh/model-studio/model-pricing', compatible: true },
  { name: 'DeepSeek V4 Pro', provider: 'DeepSeek', input: '$1.32 峰时 / MTok', output: '$3.96 峰时 / MTok', context: '1M（官方）', use: '高阶中文文本候选；峰谷时段会改变单价。', source: 'https://api-docs.deepseek.com/quick_start/pricing/', compatible: true },
  { name: 'Doubao Seed 2.1 Pro', provider: '火山方舟', input: '¥6 / MTok', output: '¥30 / MTok', context: '以当前型号页为准', use: '长上下文、多模态与规划候选；核对账号区域。', source: 'https://www.volcengine.com/product/ark', compatible: true },
  { name: 'Qwen 3.8 Flash', provider: '阿里云百炼', input: '¥0.80 / MTok', output: '¥2.70 / MTok', context: '1M（官方）', use: '高频结构化与摘要候选；仍须用九霄样本验证。', source: 'https://help.aliyun.com/zh/model-studio/model-pricing', compatible: true },
];
const MODEL_RATES: Record<string, { input: number; output: number; currency: 'USD' | 'CNY' }> = {
  'doubao-seed-2-1-pro-260915': { input: 6, output: 30, currency: 'CNY' },
  'deepseek-flash': { input: 0.3, output: 1.2, currency: 'USD' },
  'deepseek-v4-pro': { input: 1.32, output: 3.96, currency: 'USD' },
  'qwen3.8-flash': { input: 0.8, output: 2.7, currency: 'CNY' },
  'qwen3.8-max': { input: 12, output: 36, currency: 'CNY' },
  'kimi-k3': { input: 3, output: 15, currency: 'USD' },
  'gpt-6-astra': { input: 10, output: 50, currency: 'USD' },
};

function blankRole(enabled = false): RoleConfig {
  return { enabled, model: '', baseUrl: '', adapter: 'openai-compatible', temperature: 0.7, topP: 0.95, topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: null, maxTokens: 4096, timeoutSeconds: 90, contextWindowTokens: 32768, responseFormat: 'text', streaming: true, reasoningEffort: 'default', stopSequences: '' };
}
function defaults(): AiConfig {
  return {
    version: 3,
    roles: { story: blankRole(true), director: blankRole(false), stateManager: blankRole(false), archive: blankRole(false), premiumDirector: blankRole(false) },
    connectionTestAllowed: false, logRetentionDays: 7, allowLegacyMigration: false,
    archiveInterval: 25, contextCount: 8, retryCount: 1, retryDelaySeconds: 2, activePresetId: null,
  };
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function clampNumber(value: unknown, min: number, max: number, fallback: number, integer = false): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(bounded) : bounded;
}
function safeUrl(value: string): string {
  const candidate = value.trim().replace(/\/+$/, '');
  const url = new URL(candidate);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Base URL 必须是有效的 HTTP(S) 地址，不能包含账号、密码或片段。');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('非本机接口必须使用 HTTPS。');
  return url.toString().replace(/\/$/, '');
}
function readConfig(): AiConfig {
  const base = defaults();
  try {
    const root = asRecord(JSON.parse(sessionStorage.getItem(CONFIG_KEY) || 'null'));
    const rawRoles = asRecord(root.roles);
    for (const role of roleMeta) {
      const raw = asRecord(rawRoles[role.id]);
      base.roles[role.id] = {
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.roles[role.id].enabled,
        model: typeof raw.model === 'string' ? raw.model : '',
        baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
        adapter: 'openai-compatible',
        temperature: clampNumber(raw.temperature, 0, 2, 0.7),
        topP: clampNumber(raw.topP, 0, 1, 0.95),
        topK: clampNumber(raw.topK, 0, 500, 0, true),
        frequencyPenalty: clampNumber(raw.frequencyPenalty, -2, 2, 0),
        presencePenalty: clampNumber(raw.presencePenalty, -2, 2, 0),
        repetitionPenalty: clampNumber(raw.repetitionPenalty, 0, 2, 1),
        seed: raw.seed === null || raw.seed === undefined || raw.seed === '' ? null : clampNumber(raw.seed, 0, 2_147_483_647, 0, true),
        maxTokens: clampNumber(raw.maxTokens, 128, 131072, 4096, true),
        timeoutSeconds: clampNumber(raw.timeoutSeconds, 5, 600, 90, true),
        contextWindowTokens: clampNumber(raw.contextWindowTokens, 1024, 2_000_000, 32768, true),
        responseFormat: raw.responseFormat === 'json_object' ? 'json_object' : 'text',
        streaming: typeof raw.streaming === 'boolean' ? raw.streaming : true,
        reasoningEffort: ['low', 'medium', 'high'].includes(String(raw.reasoningEffort)) ? raw.reasoningEffort as RoleConfig['reasoningEffort'] : 'default',
        stopSequences: typeof raw.stopSequences === 'string' ? raw.stopSequences.slice(0, 1000) : '',
      };
    }
    base.connectionTestAllowed = root.connectionTestAllowed === true;
    base.logRetentionDays = clampNumber(root.logRetentionDays, 0, 90, 7, true);
    base.allowLegacyMigration = root.allowLegacyMigration === true;
    base.archiveInterval = clampNumber(root.archiveInterval, 1, 100, 25, true);
    base.contextCount = clampNumber(root.contextCount, 0, 120, 8, true);
    base.retryCount = clampNumber(root.retryCount, 0, 3, 1, true);
    base.retryDelaySeconds = clampNumber(root.retryDelaySeconds, 1, 30, 2, true);
    base.activePresetId = typeof root.activePresetId === 'string' && presets.some(preset => preset.id === root.activePresetId) ? root.activePresetId : null;
  } catch { /* malformed settings are replaced only after the user saves */ }
  return base;
}
function safeConfig(config: AiConfig): Omit<AiConfig, 'version'> & { version: 3 } {
  return { ...config, version: 3 };
}
function readLogs(retentionDays: number): CallLog[] {
  try {
    const values: unknown = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
    if (retentionDays === 0) { sessionStorage.removeItem(LOG_KEY); return []; }
    const cutoff = Date.now() - retentionDays * 86_400_000;
    if (!Array.isArray(values)) { sessionStorage.removeItem(LOG_KEY); return []; }
    const retained = values.filter((entry): entry is CallLog => {
      const log = asRecord(entry);
      const timestamp = typeof log.at === 'string' ? Date.parse(log.at) : Number.NaN;
      return Number.isFinite(timestamp) && timestamp >= cutoff
        && typeof log.role === 'string' && typeof log.model === 'string'
        && typeof log.elapsedMs === 'number' && Number.isFinite(log.elapsedMs) && log.elapsedMs >= 0
        && (log.outcome === 'success' || log.outcome === 'failure');
    }).slice(-200);
    if (retained.length) sessionStorage.setItem(LOG_KEY, JSON.stringify(retained));
    else sessionStorage.removeItem(LOG_KEY);
    return retained;
  } catch { try { sessionStorage.removeItem(LOG_KEY); } catch { /* session storage may be unavailable */ } return []; }
}
function addLog(entry: CallLog, retentionDays: number): CallLog[] {
  const logs = [...readLogs(retentionDays), entry].slice(-200);
  try { if (retentionDays === 0) sessionStorage.removeItem(LOG_KEY); else sessionStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch { /* logs are optional */ }
  return retentionDays === 0 ? [] : logs;
}
function endpoint(baseUrl: string): string {
  const base = safeUrl(baseUrl);
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${/\/v\d+$/i.test(base) ? base : `${base}/v1`}/chat/completions`;
}

function migrateLegacy(): { config: AiConfig; keys: Partial<Record<RoleId, string>> } {
  const next = readConfig();
  const migratedKeys: Partial<Record<RoleId, string>> = {};
  let found = false;
  try {
    const multi = asRecord(JSON.parse(sessionStorage.getItem(LEGACY_MULTI_KEY) || 'null'));
    const oldRoles = asRecord(multi.roles);
    for (const role of roleMeta) {
      const old = asRecord(oldRoles[role.id]);
      if (Object.keys(old).length) {
        found = true;
        next.roles[role.id] = {
          ...next.roles[role.id],
          enabled: old.enabled === true,
          model: typeof old.model === 'string' ? old.model : next.roles[role.id].model,
          baseUrl: typeof old.baseUrl === 'string' ? old.baseUrl : next.roles[role.id].baseUrl,
          temperature: clampNumber(old.temperature, 0, 2, next.roles[role.id].temperature),
          topP: clampNumber(old.topP, 0, 1, next.roles[role.id].topP),
          maxTokens: clampNumber(old.maxTokens, 128, 131072, next.roles[role.id].maxTokens, true),
          timeoutSeconds: clampNumber(old.timeout, 5, 600, next.roles[role.id].timeoutSeconds, true),
        };
        if (typeof old.apiKey === 'string' && old.apiKey) migratedKeys[role.id] = old.apiKey;
      }
    }
    next.archiveInterval = clampNumber(multi.archiveInterval, 1, 100, next.archiveInterval, true);
    next.contextCount = clampNumber(multi.contextCount, 0, 120, next.contextCount, true);
  } catch { /* try the original single-model setting below */ }
  try {
    const single = asRecord(JSON.parse(sessionStorage.getItem(LEGACY_SINGLE_KEY) || 'null'));
      if (typeof single.endpoint === 'string' || typeof single.baseUrl === 'string') {
      found = true;
      const story = next.roles.story;
      story.enabled = true;
      story.baseUrl = typeof single.endpoint === 'string' ? single.endpoint : String(single.baseUrl || '');
      if (typeof single.model === 'string') story.model = single.model;
      if (typeof single.temperature === 'number') story.temperature = clampNumber(single.temperature, 0, 2, story.temperature);
      if (typeof single.topP === 'number') story.topP = clampNumber(single.topP, 0, 1, story.topP);
      if (typeof single.maxTokens === 'number') story.maxTokens = clampNumber(single.maxTokens, 128, 131072, story.maxTokens, true);
      if (typeof single.contextCount === 'number') next.contextCount = clampNumber(single.contextCount, 0, 120, next.contextCount, true);
      if (typeof single.apiKey === 'string' && single.apiKey) migratedKeys.story = single.apiKey;
    }
  } catch { /* invalid legacy config is never applied */ }
  if (!found) throw new Error('当前浏览器会话中没有可迁移的旧版 AI 配置。');
  return { config: next, keys: migratedKeys };
}

export function AiSettings() {
  const [config, setConfig] = useState<AiConfig>(readConfig);
  const [keys, setKeys] = useState<Partial<Record<RoleId, string>>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<CallLog[]>(() => readLogs(config.logRetentionDays));
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [modal, setModal] = useState<{ kind: 'catalog'; view: 'providers' | 'provider' | 'comparison'; providerId?: string } | { kind: 'preset'; preset: Preset } | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [dailyRounds, setDailyRounds] = useState(20);
  const [weeklyRounds, setWeeklyRounds] = useState(140);
  const [estimateUsage, setEstimateUsage] = useState<Record<RoleId, { callsPer100: number; inputTokens: number; outputTokens: number }>>({
    story: { callsPer100: 100, inputTokens: 8000, outputTokens: 1400 },
    director: { callsPer100: 100, inputTokens: 6000, outputTokens: 800 },
    stateManager: { callsPer100: 100, inputTokens: 2500, outputTokens: 300 },
    archive: { callsPer100: 4, inputTokens: 10000, outputTokens: 1200 },
    premiumDirector: { callsPer100: 0, inputTokens: 18000, outputTokens: 2600 },
  });
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (modal && dialog && !dialog.open) dialog.showModal();
    if (!modal && dialog?.open) dialog.close();
  }, [modal]);
  const migrationPossible = useMemo(() => {
    try { return Boolean(sessionStorage.getItem(LEGACY_MULTI_KEY) || sessionStorage.getItem(LEGACY_SINGLE_KEY)); } catch { return false; }
  }, []);

  useEffect(() => { setLogs(readLogs(config.logRetentionDays)); }, [config.logRetentionDays]);
  function updateRole<K extends keyof RoleConfig>(roleId: RoleId, key: K, value: RoleConfig[K]) {
    setConfig(current => ({ ...current, activePresetId: null, roles: { ...current.roles, [roleId]: { ...current.roles[roleId], [key]: value } } }));
    setSaved(false);
  }
  function applyPreset(preset: Preset) {
    const next: AiConfig = {
      ...config, activePresetId: preset.id,
      roles: Object.fromEntries(roleMeta.map(role => [role.id, {
        ...config.roles[role.id], enabled: role.id === 'premiumDirector' ? false : true, model: preset.models[role.id],
        baseUrl: providerDefaults[preset.providers[role.id]] || config.roles[role.id].baseUrl,
        temperature: preset.temperature, topP: preset.topP, maxTokens: preset.maxTokens,
        topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: null,
        timeoutSeconds: 90, contextWindowTokens: preset.models[role.id] === 'kimi-k3' ? 1_000_000 : preset.models[role.id] === 'gpt-6-astra' ? 1_050_000 : 32768,
        responseFormat: role.id === 'stateManager' || role.id === 'archive' ? 'json_object' : 'text',
        streaming: true,
        reasoningEffort: preset.id === 'longform' ? 'high' : 'default',
        stopSequences: '',
      }])) as AiConfig['roles'],
      retryCount: preset.id === 'mist' ? 0 : 1, retryDelaySeconds: 2,
      logRetentionDays: 7, archiveInterval: 25, contextCount: preset.id === 'mist' ? 4 : 8,
      allowLegacyMigration: false,
      // Connection testing is a separate consent and is deliberately not granted by a preset.
      connectionTestAllowed: config.connectionTestAllowed,
    };
    setConfig(next); setSaved(false); setError('');
    try {
      sessionStorage.setItem(CONFIG_KEY, JSON.stringify(safeConfig(next)));
      setSaved(true);
      setMessage(`「青鸟 · ${preset.title}」已应用。五个岗位的非密钥参数已填写；请自行填入 API Key。游戏回合调度尚未接入，当前不会据此自动调用模型。`);
    } catch { setMessage(`「青鸟 · ${preset.title}」已填入当前表单；请自行填入 API Key，再保存配置。`); }
    setModal(null);
  }
  function save() {
    for (const role of roleMeta) {
      const value = config.roles[role.id];
      if (value.enabled && !value.model.trim()) { setError(`${role.title}已启用，请填写服务商实际 Model ID。`); return; }
      if (value.baseUrl.trim()) {
        try { safeUrl(value.baseUrl); } catch (reason) { setError(`${role.title}：${reason instanceof Error ? reason.message : 'Base URL 无效。'}`); return; }
      }
    }
    try {
      sessionStorage.setItem(CONFIG_KEY, JSON.stringify(safeConfig(config)));
      const retained = readLogs(config.logRetentionDays);
      if (config.logRetentionDays === 0) sessionStorage.removeItem(LOG_KEY);
      else sessionStorage.setItem(LOG_KEY, JSON.stringify(retained));
      setLogs(retained);
      setError(''); setMessage('设置已保存到当前浏览器会话。API Key 只保留在当前页面内存，刷新页面后需重新输入。'); setSaved(true);
    } catch { setError('当前浏览器无法保存设置；页面中的输入仍在，请先导出配置前确认不包含密钥。'); setSaved(false); }
  }
  function importLegacy() {
    if (!config.allowLegacyMigration) { setError('请先开启“允许旧配置迁移”，再主动执行导入。'); return; }
    try {
      const migrated = migrateLegacy();
      setConfig(migrated.config); setKeys(migrated.keys); setSaved(false); setError('');
      setMessage('旧版模型与参数已载入表单，未自动保存。密钥只放入当前页面内存，不会保存到新配置；旧配置仍留在 sessionStorage。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '旧配置读取失败。'); }
  }
  async function testConnection(roleId: RoleId) {
    const active = config.roles[roleId];
    const roleTitle = roleMeta.find(role => role.id === roleId)!.title;
    if (!config.connectionTestAllowed) { setError('请先开启“允许连接测试”。测试会向所填地址发送一次短请求，并可能产生服务商费用。'); return; }
    if (!active.model.trim()) { setError('请先填写当前岗位的实际 Model ID。'); return; }
    if (!active.baseUrl.trim()) { setError('请先填写当前岗位的 Base URL。'); return; }
    setTesting(true); setError(''); setMessage('正在测试，只发送“请仅回复：通路已通”。');
    const start = performance.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), active.timeoutSeconds * 1000);
    try {
      const response = await fetch(endpoint(active.baseUrl), {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(keys[roleId]?.trim() ? { Authorization: `Bearer ${keys[roleId]!.trim()}` } : {}) },
        body: JSON.stringify({ model: active.model.trim(), messages: [{ role: 'user', content: '请仅回复：通路已通' }], temperature: 0, max_tokens: 24, stream: false }),
      });
      const elapsedMs = Math.round(performance.now() - start);
      if (!response.ok) {
        const entry: CallLog = { at: new Date().toISOString(), role: roleTitle, model: active.model.trim(), elapsedMs, outcome: 'failure', status: response.status, errorCode: `HTTP_${response.status}` };
        setLogs(addLog(entry, config.logRetentionDays));
        throw new Error(`服务返回 HTTP ${response.status}。请检查 Base URL、Key、Model ID 和账号权限；响应正文未保存。`);
      }
      const data: unknown = await response.json();
      const body = asRecord(data); const usage = asRecord(body.usage);
      const choices = Array.isArray(body.choices) ? body.choices : [];
      const first = asRecord(choices[0]); const output = asRecord(first.message).content;
      if (typeof output !== 'string' || !output.trim()) throw new Error('服务已响应，但返回格式不是当前 OpenAI 兼容适配器可识别的文本。');
      const entry: CallLog = {
        at: new Date().toISOString(), role: roleTitle, model: active.model.trim(), elapsedMs, outcome: 'success',
        ...(typeof usage.prompt_tokens === 'number' ? { inputTokens: usage.prompt_tokens } : {}),
        ...(typeof usage.completion_tokens === 'number' ? { outputTokens: usage.completion_tokens } : {}),
      };
      setLogs(addLog(entry, config.logRetentionDays)); setMessage(`连接成功，${elapsedMs} ms。测试回复：${output.slice(0, 60)}`);
    } catch (reason) {
      const messageText = reason instanceof Error ? reason.message : '网络请求失败。';
      if (!messageText.startsWith('服务返回 HTTP')) {
        const entry: CallLog = { at: new Date().toISOString(), role: roleTitle, model: active.model.trim(), elapsedMs: Math.round(performance.now() - start), outcome: 'failure', errorCode: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_FORMAT' };
        setLogs(addLog(entry, config.logRetentionDays));
      }
      setError(controller.signal.aborted ? `超过 ${active.timeoutSeconds} 秒，连接已中止。可核对超时与服务商状态后重试。` : messageText);
    } finally { window.clearTimeout(timer); setTesting(false); }
  }

  const visibleProviders = useMemo(() => {
    const query = catalogSearch.trim().toLocaleLowerCase();
    return providerCatalog.filter(provider => !query || [provider.name, provider.region, provider.summary, ...provider.capabilities].join(' ').toLocaleLowerCase().includes(query));
  }, [catalogSearch]);
  function presetEstimate(preset: Preset, rounds = 1) {
    const totals: Record<string, number> = {};
    for (const role of roleMeta) {
      const model = preset.models[role.id];
      const rates = MODEL_RATES[model];
      if (!rates) continue;
      const usage = estimateUsage[role.id];
      const calls = (Math.max(0, usage.callsPer100) / 100) * Math.max(0, rounds);
      const amount = (usage.inputTokens * rates.input + usage.outputTokens * rates.output) / 1_000_000 * calls;
      totals[rates.currency] = (totals[rates.currency] || 0) + amount;
    }
    return Object.entries(totals).map(([currency, amount]) => `${currency === 'CNY' ? '¥' : '$'}${amount.toFixed(5)}`).join(' + ');
  }
  const providerById = (id: string) => providerCatalog.find(provider => provider.id === id);
  const providerDetail = modal?.kind === 'catalog' && modal.view === 'provider' ? providerById(modal.providerId || '') : undefined;
  function closeDialog() { if (dialogRef.current?.open) dialogRef.current.close(); setModal(null); }

  return <section className="page ai-page">
    <h1 className="ai-title">AI 设定</h1>
    <p>配置五个岗位的模型与调用方式。密钥只在本页临时使用。</p>
    <div className="ai-start-actions"><button className="provider-open" onClick={() => { setCatalogSearch(''); setModal({ kind: 'catalog', view: 'providers' }); }}><span>⌕</span><span><strong>模型与服务商目录</strong><small>查模型、接入方式与官方价格</small></span><b>打开目录　›</b></button><span className="catalog-date">价格核验日：{catalogVerifiedOn}</span></div>
    <button className="comparison-link" onClick={() => setModal({ kind: 'catalog', view: 'comparison' })}><span>价格与能力总览比较</span><span>打开模型比较　›</span></button>
    <div className="recommend-heading"><div><span className="eyebrow">五岗位分别选型</span><h2>青鸟推荐</h2></div><p>先用推荐值起步；每个岗位都能单独改模型、参数和密钥。</p></div>
    {config.activePresetId && presets.find(item => item.id === config.activePresetId) && <div className="active-recipe" role="status"><span className="active-seal">青</span><span><strong>青鸟 · {presets.find(item => item.id === config.activePresetId)!.title}</strong><small>推荐参数已填入。请为启用的岗位填写对应 API Key；高级剧情默认停用。游戏回合调度尚未接入。</small></span><button className="text-button" onClick={() => setModal({ kind: 'catalog', view: 'providers' })}>打开服务商目录</button></div>}
    <section className="preset-grid" aria-label="青鸟推荐档位">
      {presets.map(preset => <article className={`preset-card ${config.activePresetId === preset.id ? 'preset-active' : ''}`} key={preset.id}><span className="preset-mark">{preset.title.slice(0, 1)}</span><h3>{preset.title}</h3><p>{preset.tone}</p><small>{preset.detail}</small><button className="secondary" onClick={() => setModal({ kind: 'preset', preset })}>{config.activePresetId === preset.id ? '查看已应用档位' : '查看配置与成本'}</button></article>)}
    </section>
    <div className="notice-inline"><strong>开用前看一眼</strong><span>不同地区的账号权限、Model ID 与价格可能不同。请按你开户地区的官方控制台复核；预设不会替你测试连接。</span></div>
    <section className="role-list" aria-label="五个 AI 岗位">
      {roleMeta.map((role, index) => {
        const active = config.roles[role.id];
        return <details className="role-panel" key={role.id} open={index === 0 ? undefined : false}>
          <summary><span className="role-index">0{index + 1}</span><span className="role-summary"><strong>{role.title}</strong><small>{role.purpose}</small></span><span className={active.enabled ? (active.model.trim() && active.baseUrl.trim() ? 'role-state enabled' : 'role-state pending') : 'role-state'}>{active.enabled ? (active.model.trim() && active.baseUrl.trim() ? '已配置' : '待配置') : '已停用'}</span></summary>
          <div className="role-fields">
            <label className="toggle-line role-toggle"><span>岗位调用</span><input type="checkbox" checked={active.enabled} onChange={event => updateRole(role.id, 'enabled', event.target.checked)} /><span className="switch-visual" aria-hidden="true" /><small>{active.enabled ? '启用' : '停用'}</small></label>
            <label className="setting-field">Model ID<input value={active.model} onChange={event => updateRole(role.id, 'model', event.target.value)} placeholder="填写服务商控制台显示的 ID" autoComplete="off" /></label>
            <label className="setting-field">Base URL<input value={active.baseUrl} onChange={event => updateRole(role.id, 'baseUrl', event.target.value)} placeholder="https://api.example.com" inputMode="url" autoComplete="url" /><small>当前适配器使用 OpenAI Chat Completions 兼容协议。非本机地址必须使用 HTTPS。</small></label>
            <label className="setting-field">API Key（仅当前页面内存）<input type="password" value={keys[role.id] || ''} onChange={event => setKeys(current => ({ ...current, [role.id]: event.target.value }))} placeholder="粘贴当前岗位使用的密钥" autoComplete="new-password" /><small>不写入存档、设置文件或调用记录；离开页面或刷新后需要重输。不要把密钥发给协作者或提交到 Git。</small></label>
            <div className="number-grid">
              <label className="setting-field">Temperature<input type="number" min="0" max="2" step="0.05" value={active.temperature} onChange={event => updateRole(role.id, 'temperature', clampNumber(event.target.value, 0, 2, active.temperature))} /></label>
              <label className="setting-field">TopP<input type="number" min="0" max="1" step="0.01" value={active.topP} onChange={event => updateRole(role.id, 'topP', clampNumber(event.target.value, 0, 1, active.topP))} /></label>
              <label className="setting-field">最大回复 tokens<input type="number" min="128" max="131072" step="128" value={active.maxTokens} onChange={event => updateRole(role.id, 'maxTokens', clampNumber(event.target.value, 128, 131072, active.maxTokens, true))} /></label>
              <label className="setting-field">超时（秒）<input type="number" min="5" max="600" step="5" value={active.timeoutSeconds} onChange={event => updateRole(role.id, 'timeoutSeconds', clampNumber(event.target.value, 5, 600, active.timeoutSeconds, true))} /></label>
            </div>
            <details className="advanced-fields"><summary>更多生成选项与服务细节</summary><div className="number-grid">
              <label className="setting-field">Top K<input type="number" min="0" max="500" value={active.topK} onChange={event => updateRole(role.id, 'topK', clampNumber(event.target.value, 0, 500, active.topK, true))} /><small>0 表示不指定；部分服务商不支持。</small></label>
              <label className="setting-field">Frequency Penalty<input type="number" min="-2" max="2" step="0.05" value={active.frequencyPenalty} onChange={event => updateRole(role.id, 'frequencyPenalty', clampNumber(event.target.value, -2, 2, active.frequencyPenalty))} /></label>
              <label className="setting-field">Presence Penalty<input type="number" min="-2" max="2" step="0.05" value={active.presencePenalty} onChange={event => updateRole(role.id, 'presencePenalty', clampNumber(event.target.value, -2, 2, active.presencePenalty))} /></label>
              <label className="setting-field">Repetition Penalty<input type="number" min="0" max="2" step="0.05" value={active.repetitionPenalty} onChange={event => updateRole(role.id, 'repetitionPenalty', clampNumber(event.target.value, 0, 2, active.repetitionPenalty))} /><small>非所有 API 采用相同范围与语义。</small></label>
              <label className="setting-field">Seed（可选）<input type="number" min="0" max="2147483647" value={active.seed ?? ''} placeholder="留空：由服务端决定" onChange={event => updateRole(role.id, 'seed', event.target.value === '' ? null : clampNumber(event.target.value, 0, 2_147_483_647, 0, true))} /><small>同一 Seed 不保证跨版本或跨服务商完全复现。</small></label>
              <label className="setting-field">期望上下文上限（tokens）<input type="number" min="1024" max="2000000" step="1024" value={active.contextWindowTokens} onChange={event => updateRole(role.id, 'contextWindowTokens', clampNumber(event.target.value, 1024, 2_000_000, active.contextWindowTokens, true))} /><small>记录你的目标预算；不是供应商承诺值，也不会自动截断剧情。</small></label>
              <label className="setting-field">输出格式<select value={active.responseFormat} onChange={event => updateRole(role.id, 'responseFormat', event.target.value as RoleConfig['responseFormat'])}><option value="text">普通文本</option><option value="json_object">JSON 对象</option></select><small>结构化结果仍须通过游戏规则验证。</small></label>
              <label className="setting-field">推理强度<select value={active.reasoningEffort} onChange={event => updateRole(role.id, 'reasoningEffort', event.target.value as RoleConfig['reasoningEffort'])}><option value="default">服务商默认</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><small>只有支持该参数的型号才能使用。</small></label>
              <label className="toggle-line"><input type="checkbox" checked={active.streaming} onChange={event => updateRole(role.id, 'streaming', event.target.checked)} />期望使用流式输出</label>
              <label className="setting-field advanced-wide">停止序列（每行一项）<textarea rows={3} maxLength={1000} value={active.stopSequences} onChange={event => updateRole(role.id, 'stopSequences', event.target.value.slice(0, 1000))} placeholder="留空表示不设置" /><small>不同服务商支持情况不同；当前仅保存，不会发送。</small></label>
            </div><p className="quiet-note">这些字段目前作为受约束的配置草案保存；游戏回合尚未接入岗位调度，不会发送以上采样参数。不同服务商接受的参数不同，正式接入时会按能力表过滤。</p><p className="quiet-note">世界 Canon、规则和状态契约不开放给自由提示词或正则表达式改写。模型不得凭输出直接改变生命、物品、任务等权威状态。</p></details>
            <div className="connection-row"><span>该岗位的连接测试</span><button className="secondary" onClick={() => void testConnection(role.id)} disabled={testing || !config.connectionTestAllowed || !active.enabled}>{testing ? '测试中…' : '测试此岗位'}</button></div>
          </div>
        </details>;
      })}
    </section>
    <label className="toggle-line test-permission"><input type="checkbox" checked={config.connectionTestAllowed} onChange={event => setConfig(current => ({ ...current, connectionTestAllowed: event.target.checked }))} />允许连接测试</label>
    <p className="quiet-note">测试会发送一次极短文本请求，可能产生费用。浏览器跨域策略也可能阻止直连；失败不代表 Model ID 一定错误。</p>
    <section className="card settings-card"><h3>全局调度与隐私</h3><div className="number-grid">
      <label className="setting-field">调用记录保留（天）<select value={config.logRetentionDays} onChange={event => setConfig(current => ({ ...current, logRetentionDays: Number(event.target.value) }))}><option value="0">不保存</option><option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option></select></label>
      <label className="setting-field">世界档案整理周期（回合）<input type="number" min="1" max="100" value={config.archiveInterval} onChange={event => setConfig(current => ({ ...current, archiveInterval: clampNumber(event.target.value, 1, 100, config.archiveInterval, true) }))} /></label>
      <label className="setting-field">近期上下文消息数<input type="number" min="0" max="120" value={config.contextCount} onChange={event => setConfig(current => ({ ...current, contextCount: clampNumber(event.target.value, 0, 120, config.contextCount, true) }))} /></label>
      <label className="setting-field">失败后重试次数<input type="number" min="0" max="3" value={config.retryCount} onChange={event => setConfig(current => ({ ...current, retryCount: clampNumber(event.target.value, 0, 3, config.retryCount, true) }))} /><small>仅供后续回合调度使用；当前设置页不会自动重试连接测试。</small></label>
      <label className="setting-field">重试间隔（秒）<input type="number" min="1" max="30" value={config.retryDelaySeconds} onChange={event => setConfig(current => ({ ...current, retryDelaySeconds: clampNumber(event.target.value, 1, 30, config.retryDelaySeconds, true) }))} /><small>后续将用有上限的退避；超时或结算后不会盲目重放。</small></label>
    </div><p className="quiet-note">调用记录仅包含岗位、Model ID、时间、耗时、HTTP 状态和服务商返回的 token 统计。不记录 API Key、提示词、剧情正文或响应正文。重试、上下文预算与采样字段尚未接入游戏回合。</p></section>
    <section className="card settings-card"><h3>旧配置迁移</h3><p>只读取当前站点浏览器会话中的 `jx_ai_config` / `jx1_config`。从 `file://` 旧 HTML 导出的存档不会包含 sessionStorage 配置；跨来源数据需要你另行手动录入。</p><label className="toggle-line"><input type="checkbox" checked={config.allowLegacyMigration} onChange={event => setConfig(current => ({ ...current, allowLegacyMigration: event.target.checked }))} />允许我手动迁移当前浏览器中的旧配置</label><div><button className="secondary" onClick={importLegacy} disabled={!config.allowLegacyMigration || !migrationPossible}>读取旧配置到表单</button>{!migrationPossible && <small className="quiet-note">当前来源没有可检测的旧配置。</small>}</div></section>
    <section className="card settings-card" id="ai-call-logs"><div className="logs-heading"><h3>最近调用记录</h3><button className="secondary" onClick={() => { if (!window.confirm('清空本浏览器会话中保存的调用记录？')) return; try { sessionStorage.removeItem(LOG_KEY); } catch { /* storage unavailable */ } setLogs([]); }}>清空记录</button></div>{logs.length ? <div className="log-list">{logs.slice().reverse().map((log, index) => <article key={`${log.at}-${index}`}><strong>{log.role} · {log.model}</strong><span>{new Date(log.at).toLocaleString()} · {log.elapsedMs} ms · {log.outcome === 'success' ? '成功' : `失败${log.status ? ` / HTTP ${log.status}` : ''}`}</span><small>输入 {log.inputTokens ?? '服务商未报告'} / 输出 {log.outputTokens ?? '服务商未报告'} tokens</small></article>)}</div> : <p className="quiet-note">目前没有保存的调用记录。</p>}</section>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className={saved ? 'success' : 'status-message'} role="status">{message}</p>}
    <div className="ai-actionbar"><button className="primary" onClick={save}>保存配置</button><button className="secondary" onClick={() => document.getElementById('ai-call-logs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>调用记录</button><button className="secondary" onClick={() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); }}>关闭</button></div>
    <dialog ref={dialogRef} className="glass-dialog" onClose={() => setModal(null)} aria-labelledby="ai-modal-title">
      <button className="dialog-close" onClick={closeDialog} aria-label="关闭窗口">×</button>
      <div className="dialog-scroll-region" key={modal?.kind === 'catalog' ? `${modal.view}-${modal.providerId || ''}` : modal?.kind}>
        {modal?.kind === 'catalog' && modal.view === 'providers' && <>
          <div className="dialog-heading"><span className="eyebrow">服务商</span><h2 id="ai-modal-title">模型与服务商目录</h2></div>
          <label className="catalog-search">查找厂商<input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="输入厂商名称" autoFocus /></label>
          <div className="directory-toolbar"><button className="comparison-link" onClick={() => setModal({ kind: 'catalog', view: 'comparison' })}><span>价格与能力总览比较</span><span>模型表与参考指标　›</span></button></div>
          <nav className="provider-name-list" aria-label="服务商列表，可滚动浏览">
            {visibleProviders.map(provider => <button key={provider.id} onClick={() => setModal({ kind: 'catalog', view: 'provider', providerId: provider.id })}><span>{provider.name}</span><span aria-hidden="true">›</span></button>)}
            {!visibleProviders.length && <p className="quiet-note">没有找到这个名称。</p>}
          </nav>
        </>}
        {modal?.kind === 'catalog' && modal.view === 'provider' && providerDetail && <>
          <div className="dialog-heading detail-heading"><button className="back-link" onClick={() => setModal({ kind: 'catalog', view: 'providers' })}>‹　服务商</button><span className="eyebrow">{providerDetail.region} · {providerDetail.compatibility}</span><h2 id="ai-modal-title">{providerDetail.name}</h2><p>{providerDetail.summary}</p></div>
          <div className="provider-detail-body">
            <div className="provider-tags">{providerDetail.capabilities.map(tag => <span key={tag}>{tag}</span>)}</div>
            <div className="provider-links detail-links">{providerDetail.keyUrl && <a href={providerDetail.keyUrl} target="_blank" rel="noreferrer">申请 API Key ↗</a>}{providerDetail.docsUrl && <a href={providerDetail.docsUrl} target="_blank" rel="noreferrer">API 文档 ↗</a>}{providerDetail.pricingUrl && <a href={providerDetail.pricingUrl} target="_blank" rel="noreferrer">官方型号与价格 ↗</a>}</div>
            <p className="table-scroll-hint">表格可横向滑动，查看完整价格与说明。</p>
            <div className="model-table-wrap"><table className="model-table"><caption>已核对型号 · 价格快照 {catalogVerifiedOn}</caption><thead><tr><th>Model ID</th><th>用途 / 说明</th><th>输入价 / 1M tokens</th><th>输出价 / 1M tokens</th></tr></thead><tbody>{providerDetail.models.map(model => <tr key={model.id}><td><code>{model.id}</code></td><td>{model.use}</td><td>{model.input || '见官方价格表'}</td><td>{model.output || '见官方价格表'}</td></tr>)}</tbody></table></div>
            <p className="quiet-note">目录只列出已核对型号。缓存、区域、上下文档位和活动可能改变费用，完整型号与实时价格见厂商官网。</p>
            {providerDetail.compatibility !== 'OpenAI 兼容协议' && <p className="compatibility-note">九霄当前只测试 OpenAI Chat Completions 兼容接口；该厂商原生接口暂不能在这里测试。</p>}
          </div>
        </>}
        {modal?.kind === 'catalog' && modal.view === 'comparison' && <>
          <div className="dialog-heading detail-heading"><button className="back-link" onClick={() => setModal({ kind: 'catalog', view: 'providers' })}>‹　服务商目录</button><span className="eyebrow">公开资料 · 分项比较</span><h2 id="ai-modal-title">价格与能力总览比较</h2><p>先看价格，再看人群偏好和服务条件。不同榜单测的不是同一件事。</p></div>
          <div className="comparison-body">
            <div className="comparison-sources"><a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer"><strong>Artificial Analysis</strong><span>综合评测、速度、价格与方法说明 ↗</span></a><a href="https://arena.ai/leaderboard/text/english" target="_blank" rel="noreferrer"><strong>Arena</strong><span>用户盲测偏好榜；英文文本榜，非修仙叙事专项 ↗</span></a><a href="https://www.aicpb.com/ai-rankings/models/llm" target="_blank" rel="noreferrer"><strong>AICPB</strong><span>第三方型号与价格索引；核对其来源日期 ↗</span></a></div>
            <p className="table-scroll-hint">表格可横向滑动，查看完整型号与价格。</p>
            <div className="model-table-wrap"><table className="model-table comparison-table"><caption>代表型号快照 · {catalogVerifiedOn}</caption><thead><tr><th>模型 / 厂商</th><th>输入价</th><th>输出价</th><th>上下文参考</th><th>适用方向（待九霄样本验证）</th><th>九霄当前接口</th><th>价格来源</th></tr></thead><tbody>{comparisonModels.map(model => <tr key={model.name}><td><strong>{model.name}</strong><small>{model.provider}</small></td><td>{model.input}</td><td>{model.output}</td><td>{model.context}</td><td>{model.use}</td><td>{model.compatible ? '兼容格式候选' : '需开发原生适配'}</td><td><a href={model.source} target="_blank" rel="noreferrer">官方价目页 ↗</a></td></tr>)}</tbody></table></div>
            <p className="quiet-note">本表列出代表型号，不是全球全量目录。价格快照核验于 {catalogVerifiedOn}；缓存、上下文分段、峰谷、活动和账户区域会改变账单。币种分开列示，不作汇率换算。Artificial Analysis 与 Arena 提供不同任务、不同方法的评测；这里链接到实时页面，不搬录综合分数。</p>
            <p className="compatibility-note">榜单不能替代九霄自己的中文修仙文本盲测。应固定同一段输入，对照人物一致性、因果、文风、结构化正确率、延迟和实付成本。</p>
          </div>
        </>}
        {modal?.kind === 'preset' && <>
          <div className="dialog-heading detail-heading"><span className="eyebrow">青鸟推荐 · 五岗位方案</span><h2 id="ai-modal-title">{modal.preset.title}</h2><p>{modal.preset.tone} {modal.preset.detail}</p></div>
          <div className="preset-caution"><strong>应用会替换五岗位的 Model ID、Base URL 和采样参数。</strong><span>密钥不会自动填写；高级剧情岗位预设为关闭。连接测试权限按你当前选择保留。</span></div>
          <div className="preset-role-map">{roleMeta.map(role => { const provider = providerById(modal.preset.providers[role.id]); return <article key={role.id}><span>{role.title}</span><strong>{modal.preset.models[role.id]}</strong><small>{provider?.name || '自定义服务'} · {modal.preset.reasons[role.id]}</small></article>; })}</div>
          <section className="estimate-box"><div><h3>按你预计的用量估算</h3><p>输入每日和每周回合数，再按岗位改调用频次与单次 token 数。世界档案默认每 25 回合整理一次；高级剧情默认不调用。</p></div>
            <div className="estimate-inputs"><label>每日回合<input type="number" min="0" max="10000" value={dailyRounds} onChange={event => setDailyRounds(clampNumber(event.target.value, 0, 10000, 20, true))} /></label><label>每周回合<input type="number" min="0" max="70000" value={weeklyRounds} onChange={event => setWeeklyRounds(clampNumber(event.target.value, 0, 70000, 140, true))} /></label></div>
            <details className="usage-breakdown"><summary>按岗位调整调用频次与 tokens</summary><div className="usage-rows">{roleMeta.map(role => <div className="usage-row" key={role.id}><strong>{role.title}</strong><label>每百回合调用<input aria-label={`${role.title}每百回合调用次数`} type="number" min="0" max="500" step="1" value={estimateUsage[role.id].callsPer100} onChange={event => setEstimateUsage(current => ({ ...current, [role.id]: { ...current[role.id], callsPer100: clampNumber(event.target.value, 0, 500, current[role.id].callsPer100) } }))} /></label><label>单次输入<input aria-label={`${role.title}单次输入 tokens`} type="number" min="0" max="1000000" step="100" value={estimateUsage[role.id].inputTokens} onChange={event => setEstimateUsage(current => ({ ...current, [role.id]: { ...current[role.id], inputTokens: clampNumber(event.target.value, 0, 1000000, current[role.id].inputTokens, true) } }))} /></label><label>单次输出<input aria-label={`${role.title}单次输出 tokens`} type="number" min="0" max={modal.preset.maxTokens} step="100" value={estimateUsage[role.id].outputTokens} onChange={event => setEstimateUsage(current => ({ ...current, [role.id]: { ...current[role.id], outputTokens: clampNumber(event.target.value, 0, modal.preset.maxTokens, current[role.id].outputTokens, true) } }))} /></label></div>)}</div></details>
            <div className="estimate-totals"><strong>{presetEstimate(modal.preset)} / 回合</strong><span>{presetEstimate(modal.preset, dailyRounds)} / 日</span><span>{presetEstimate(modal.preset, weeklyRounds)} / 周</span></div>
            <small>按已核验标准价粗算；币种分开列示，不换汇。未计缓存、长上下文阶梯价、推理 token、工具费、税费和失败请求。岗位调度尚未接入，实际调用量未知；这只是预算参考，不是账单。</small></section>
        </>
        }
      </div>
      {modal?.kind === 'preset' && <div className="dialog-actions"><button className="secondary" onClick={closeDialog}>返回修改</button><button className="primary" onClick={() => applyPreset(modal.preset)}>应用此方案</button></div>}
    </dialog>
  </section>;
}
