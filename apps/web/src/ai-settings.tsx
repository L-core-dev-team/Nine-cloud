import { armPageNarrative } from './page-narrative';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModelPicker } from './components/ModelPicker';
import { fetchAvailableModels, type AvailableModel } from './ai-model-list';
import { catalogVerifiedOn, providerCatalog } from './ai-provider-catalog';
import { buildProbeRequest, parseProbeResponse, protocolLabels, type ProtocolId } from './ai-protocols';
import { filterRouterModels, normalizeRouterModels, type RouterModel } from './ai-model-inventory';
import { modelSamplingPolicy } from './ai-model-compatibility';
import { sanitizeCallLogs, type CallLog } from './ai-call-logs';
import { estimateModelCost, MODEL_RATE_SNAPSHOT_DATE, MODEL_RATE_VALID_UNTIL, modelRateSnapshotStatus } from './ai-model-pricing';

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
type AiSettingsMode = 'beginner' | 'professional';
type RoleConfig = {
  enabled: boolean; model: string; baseUrl: string; adapter: ProtocolId;
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
  uiMode: AiSettingsMode | null;
};
type Preset = { id: string; title: string; tone: string; detail: string; models: Record<RoleId, string>; providers: Record<RoleId, string>; adapters: Record<RoleId, ProtocolId>; reasons: Record<RoleId, string>; temperature: number; topP: number; maxTokens: number };

const providerDefaults: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  ark: 'https://ark.cn-beijing.volces.com/api/v3',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
};
const beginnerProtocolByProvider: Partial<Record<string, ProtocolId>> = {
  deepseek: 'openai-chat', ark: 'openai-chat', aliyun: 'openai-chat', moonshot: 'openai-chat', openai: 'openai-chat',
  anthropic: 'anthropic-messages', google: 'gemini-content',
};
const beginnerProviders = providerCatalog.filter(provider => providerDefaults[provider.id] && beginnerProtocolByProvider[provider.id]);
const presets: Preset[] = [
  {
    id: 'mist', title: '疏影 · 省用', tone: '把常用岗位放在轻量价位；高级剧情默认关闭。',
    detail: '主线与档案用 DeepSeek Flash，状态整理用通义千问 Flash；高级剧情预填豆包 Seed Pro，但默认停用。', temperature: 0.72, topP: 0.9, maxTokens: 2048,
    models: { story: 'deepseek-flash', director: 'qwen3.8-flash', stateManager: 'qwen3.8-flash', archive: 'deepseek-flash', premiumDirector: 'doubao-seed-2.1-pro' },
    providers: { story: 'deepseek', director: 'aliyun', stateManager: 'aliyun', archive: 'deepseek', premiumDirector: 'ark' },
    adapters: { story: 'openai-chat', director: 'openai-chat', stateManager: 'openai-chat', archive: 'openai-chat', premiumDirector: 'openai-chat' },
    reasons: { story: '主线按实际预算选择低价文本模型；可用自己的剧情样本复核文风。', director: '常规节奏检查使用千问 Flash，减少高频调用的单价。', stateManager: '状态抽取偏结构化、重复调用多，选千问 Flash。', archive: '档案候选以归纳为主，先压低整理成本。', premiumDirector: '预填方舟当前文档列出的 doubao-seed-2.1-pro，默认关闭；启用前先核对账号可用的接入点。' },
  },
  {
    id: 'balanced', title: '行云 · 合宜', tone: '把预算留给正文和关键判断，整理岗位用轻量型号。',
    detail: '主剧情用 DeepSeek V4.1 Flash，导演用豆包 Seed Pro；状态和档案分别用通义千问 Flash、DeepSeek Flash。', temperature: 0.78, topP: 0.92, maxTokens: 4096,
    models: { story: 'deepseek-flash', director: 'doubao-seed-2.1-pro', stateManager: 'qwen3.8-flash', archive: 'deepseek-flash', premiumDirector: 'doubao-seed-2.1-pro' },
    providers: { story: 'deepseek', director: 'ark', stateManager: 'aliyun', archive: 'deepseek', premiumDirector: 'ark' },
    adapters: { story: 'openai-chat', director: 'openai-chat', stateManager: 'openai-chat', archive: 'openai-chat', premiumDirector: 'openai-chat' },
    reasons: { story: '使用厂商当前公开的 deepseek-flash ID；V4.1 Flash 支持长上下文，峰时与非峰时单价不同。九霄文风仍须盲测。', director: '豆包 Seed Pro 作为章节结构候选；按常规在线推理公开价估算，按需保留。', stateManager: '结构化重复任务采用低价 Flash。', archive: '归档时重在压缩与检索线索，避免占用高阶预算。', premiumDirector: '预填方舟当前模型名但默认关闭；启用前需核对账号可用的接入点与计费档。' },
  },
  {
    id: 'longform', title: '长歌 · 旗舰', tone: '把高阶模型留给正文、导演和关键场面；结构整理另选合适型号。',
    detail: '按职责混用 Claude、GPT、Gemini 与 Kimi。旗舰名称表示高配置候选，不是九霄专项评测的客观冠军。', temperature: 0.7, topP: 1, maxTokens: 8192,
    models: { story: 'claude-opus-5-5', director: 'gpt-6.1-sol', stateManager: 'gemini-3.8-flash', archive: 'kimi-k3', premiumDirector: 'claude-opus-5-5' },
    providers: { story: 'anthropic', director: 'openai', stateManager: 'google', archive: 'moonshot', premiumDirector: 'anthropic' },
    adapters: { story: 'anthropic-messages', director: 'openai-responses', stateManager: 'gemini-content', archive: 'openai-chat', premiumDirector: 'anthropic-messages' },
    reasons: { story: 'Claude Opus 系列定位复杂长文与多步推理；高价候选，先用同一批剧情样本盲测。', director: 'GPT-6 Sol 用于结构、节奏与分支候选；状态结算仍由规则代码掌握。', stateManager: 'Gemini 原生接口可支持结构化生成；仅把输出当作待验证提案。', archive: 'Kimi 长上下文适合长篇材料整理；输入规模会显著影响费用。', premiumDirector: 'Opus 留给关键转折；默认关闭，只有用户启用才会测试或产生费用。' },
  },
  {
    id: 'narrative', title: '听潮 · 文风', tone: '把预算放在正文与人物声线；结构整理交给轻量岗位。',
    detail: 'Claude Sonnet 5.5 承担正文，Kimi 与 DeepSeek 分担长篇档案和结构提案。型号能力描述来自厂商或路由目录，不代表九霄专项评测结论。', temperature: 0.82, topP: 0.92, maxTokens: 6144,
    models: { story: 'claude-sonnet-5-5', director: 'kimi-k3', stateManager: 'qwen3.8-flash', archive: 'kimi-k3', premiumDirector: 'claude-opus-5-5' },
    providers: { story: 'anthropic', director: 'moonshot', stateManager: 'aliyun', archive: 'moonshot', premiumDirector: 'anthropic' },
    adapters: { story: 'anthropic-messages', director: 'openai-chat', stateManager: 'openai-chat', archive: 'openai-chat', premiumDirector: 'anthropic-messages' },
    reasons: { story: 'Sonnet 是复杂写作与专业工作的高阶候选；实际文风偏好须以盲测定。', director: 'Kimi 面向长上下文处理；用作伏笔与章节线索整理候选。', stateManager: '千问 Flash 用于高频结构化提案，价位与延迟更适合重复小任务。', archive: '同一长上下文型号减少拆分历史造成的信息损失；须按实际输入控制成本。', premiumDirector: 'Opus 专用于高要求段落，默认关闭以保护预算。' },
  },
  {
    id: 'multimodal', title: '万象 · 多模', tone: '跨厂商搭配长文、结构判断与多模态输入能力。',
    detail: '配置覆盖 Gemini、GPT、DeepSeek 与 Kimi。当前游戏没有图像、音频或视频剧情调用；多模态能力仅作后续兼容准备。', temperature: 0.76, topP: 0.9, maxTokens: 6144,
    models: { story: 'gemini-3.8-flash', director: 'gpt-6.1-sol', stateManager: 'deepseek-flash', archive: 'kimi-k3', premiumDirector: 'claude-opus-5-5' },
    providers: { story: 'google', director: 'openai', stateManager: 'deepseek', archive: 'moonshot', premiumDirector: 'anthropic' },
    adapters: { story: 'gemini-content', director: 'openai-responses', stateManager: 'openai-chat', archive: 'openai-chat', premiumDirector: 'anthropic-messages' },
    reasons: { story: 'Gemini Flash 厂商定位覆盖多模态与长上下文；九霄当前只发送文本。', director: 'GPT-6 Sol 作为高阶章节结构候选，不以通用排行榜分数代替叙事测试。', stateManager: 'DeepSeek Flash 的高频候选用于提取变化草案；规则引擎仍是状态权威。', archive: 'Kimi 承担较长历史归纳；需要按真实语料测算窗口与费用。', premiumDirector: '关键场面使用高阶 Claude 候选，默认停用并按需开启。' },
  },
];

const MODEL_CONTEXT: Record<string, number> = {
  'deepseek-flash': 1_000_000, 'deepseek-v4-pro': 1_000_000,
  'doubao-seed-2.1-pro': 1_024_000, 'qwen3.8-flash': 1_000_000,
  'qwen3.8-max': 1_000_000, 'kimi-k3': 1_000_000,
  'gpt-6-astra': 1_050_000, 'gpt-6.1-sol': 1_050_000, 'gpt-6-luna': 1_050_000,
  'claude-opus-5-5': 1_000_000, 'claude-sonnet-5': 1_000_000, 'claude-sonnet-5-5': 1_000_000, 'gemini-3.8-flash': 1_048_576,
};

function blankRole(enabled = false): RoleConfig {
  return { enabled, model: '', baseUrl: '', adapter: 'openai-chat', temperature: 0.7, topP: 0.95, topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: null, maxTokens: 4096, timeoutSeconds: 90, contextWindowTokens: 32768, responseFormat: 'text', streaming: true, reasoningEffort: 'default', stopSequences: '' };
}
function defaults(): AiConfig {
  return {
    version: 3,
    roles: { story: blankRole(true), director: blankRole(false), stateManager: blankRole(false), archive: blankRole(false), premiumDirector: blankRole(false) },
    connectionTestAllowed: false, logRetentionDays: 7, allowLegacyMigration: false,
    archiveInterval: 25, contextCount: 8, retryCount: 1, retryDelaySeconds: 2, activePresetId: null,
    uiMode: null,
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
  if (url.search) throw new Error('Base URL 请勿附带查询参数；密钥只会放在服务商要求的请求头中。');
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
        adapter: ['openai-chat', 'openai-responses', 'anthropic-messages', 'gemini-content'].includes(String(raw.adapter)) ? raw.adapter as ProtocolId : 'openai-chat',
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
    base.uiMode = root.uiMode === 'beginner' || root.uiMode === 'professional' ? root.uiMode : null;
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
    const retained = sanitizeCallLogs(values, retentionDays);
    if (retained.length) sessionStorage.setItem(LOG_KEY, JSON.stringify(retained));
    else sessionStorage.removeItem(LOG_KEY);
    return retained;
  } catch { try { sessionStorage.removeItem(LOG_KEY); } catch { /* session storage may be unavailable */ } return []; }
}
function addLog(entry: CallLog, retentionDays: number): CallLog[] {
  const logs = sanitizeCallLogs([...readLogs(retentionDays), entry], retentionDays);
  try { if (retentionDays === 0) sessionStorage.removeItem(LOG_KEY); else sessionStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch { /* logs are optional */ }
  return retentionDays === 0 ? [] : logs;
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

function ProfessionalAiSettings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<AiConfig>(readConfig);
  const [keys, setKeys] = useState<Partial<Record<RoleId, string>>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<CallLog[]>(() => readLogs(config.logRetentionDays));
  const [testing, setTesting] = useState(false);
  const [testingRole, setTestingRole] = useState<RoleId | null>(null);
  const [probeResults, setProbeResults] = useState<Partial<Record<RoleId, { text: string; error: boolean }>>>({});
  const [batchSource, setBatchSource] = useState<RoleId>('story');
  const [batchTargets, setBatchTargets] = useState<RoleId[]>(roleMeta.map(role => role.id));
  const [batchWithKey, setBatchWithKey] = useState(true);
  const [saved, setSaved] = useState(false);
  const [modal, setModal] = useState<{ kind: 'catalog'; view: 'providers' | 'provider' | 'comparison'; providerId?: string } | { kind: 'preset'; preset: Preset } | { kind: 'logs' } | { kind: 'batch' } | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [routerModels, setRouterModels] = useState<RouterModel[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventorySort, setInventorySort] = useState<'name' | 'input' | 'output' | 'context'>('name');
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
  const catalogReturnProviderRef = useRef<string | null>(null);
  const probeRef = useRef<AbortController | null>(null);
  useEffect(() => () => { probeRef.current?.abort(); probeRef.current = null; }, []);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (modal && dialog && !dialog.open) dialog.showModal();
    if (!modal) {
      if (dialog?.open) dialog.close();
      catalogReturnProviderRef.current = null;
      return;
    }
    if (!dialog?.open || modal.kind !== 'catalog') return;
    if (modal.view === 'provider') {
      dialog.querySelector<HTMLElement>('#ai-modal-title')?.focus();
    } else if (modal.view === 'providers' && catalogReturnProviderRef.current) {
      // The keyed view remounts its buttons: restore by provider ID, not a stale node.
      const providerId = catalogReturnProviderRef.current;
      catalogReturnProviderRef.current = null;
      const trigger = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-provider-id]'))
        .find(button => button.dataset.providerId === providerId && !button.disabled
          && button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden');
      (trigger || dialog.querySelector<HTMLInputElement>('.catalog-search input'))?.focus();
    }
  }, [modal]);

  useEffect(() => {
    if (modal?.kind !== 'catalog') return;
    const controller = new AbortController();
    setInventoryLoading(true); setInventoryError(''); setRouterModels([]);
    fetch('https://openrouter.ai/api/v1/models?output_modalities=text', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`型号目录请求失败（HTTP ${response.status}）。`); return response.json(); })
      .then(payload => setRouterModels(normalizeRouterModels(payload)))
      .catch(reason => { if (!controller.signal.aborted) setInventoryError(reason instanceof Error ? reason.message : '无法读取公开型号目录。'); })
      .finally(() => { if (!controller.signal.aborted) setInventoryLoading(false); });
    return () => controller.abort();
  }, [modal?.kind]);
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
      roles: Object.fromEntries(roleMeta.map(role => {
        const model = preset.models[role.id];
        const sampling = modelSamplingPolicy(model);
        return [role.id, {
          ...config.roles[role.id], enabled: role.id === 'premiumDirector' ? false : true, model, adapter: preset.adapters[role.id],
          baseUrl: providerDefaults[preset.providers[role.id]] || config.roles[role.id].baseUrl,
          // For providers that own sampling, store safe placeholders; request adapters must omit them.
          temperature: sampling.supported.temperature ? preset.temperature : 1,
          topP: sampling.supported.topP ? preset.topP : 1,
          maxTokens: preset.maxTokens,
          topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: null,
          timeoutSeconds: 90, contextWindowTokens: MODEL_CONTEXT[model] || 32768,
          responseFormat: role.id === 'stateManager' || role.id === 'archive' ? 'json_object' : 'text',
          streaming: true,
          reasoningEffort: preset.id === 'longform' ? 'high' : 'default',
          stopSequences: '',
        }];
      })) as AiConfig['roles'],
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
      setMessage(`「青鸟 · ${preset.title}」已应用。五个岗位的协议、型号与非密钥参数已填入；请自行填入各服务商 API Key。保存配置和页面密钥后，可在已提交的权威回合中主动生成叙事。`);
    } catch { setMessage(`「青鸟 · ${preset.title}」已填入当前表单；请自行填入 API Key，再保存配置。`); }
    setModal(null);
  }
  function save() {
    setMessage(''); setError(''); setSaved(false);
    for (const role of roleMeta) {
      const value = config.roles[role.id];
      if (value.enabled && !value.model.trim()) { setError(`${role.title}已启用，请填写服务商实际 Model ID。`); return; }
      if (value.baseUrl.trim()) {
        try { safeUrl(value.baseUrl); } catch (reason) { setError(`${role.title}：${reason instanceof Error ? reason.message : 'Base URL 无效。'}`); return; }
      }
    }
    try {
      sessionStorage.setItem(CONFIG_KEY, JSON.stringify(safeConfig(config)));
      armPageNarrative(config.roles, keys,(row,elapsedMs)=>{addLog({at:new Date().toISOString(),role:row.role,model:config.roles[row.role].model,elapsedMs,outcome:row.status==='received'?'success':'failure',...(row.status==='received'?row.reportedOutputTokens===null?{}:{outputTokens:row.reportedOutputTokens}:{errorCode:'NETWORK_OR_FORMAT'})},config.logRetentionDays);});
    } catch { setError('当前浏览器无法保存设置；页面中的输入仍在。请检查浏览器存储权限后重新保存。'); setSaved(false); return; }
    try {
      const retained = readLogs(config.logRetentionDays);
      if (config.logRetentionDays === 0) sessionStorage.removeItem(LOG_KEY);
      else sessionStorage.setItem(LOG_KEY, JSON.stringify(retained));
      setLogs(retained);
      setError(''); setMessage('设置已保存到当前浏览器会话。API Key 只保留在当前页面内存，刷新页面后需重新输入。'); setSaved(true);
    } catch { setSaved(true); setError('设置已保存，但调用记录清理失败。请检查浏览器存储权限后重试；页面中的密钥仍只在内存中。'); }
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
    if (probeRef.current) return;
    const active = config.roles[roleId];
    const roleTitle = roleMeta.find(role => role.id === roleId)!.title;
    if (!config.connectionTestAllowed) { setError('请先开启“允许连接测试”。测试会向所填地址发送一次短请求，并可能产生服务商费用。'); return; }
    if (!active.model.trim()) { setError('请先填写当前岗位的实际 Model ID。'); return; }
    if (!active.baseUrl.trim()) { setError('请先填写当前岗位的 Base URL。'); return; }
    const report = (text: string, failed = false) => {
      setProbeResults(previous => ({ ...previous, [roleId]: { text: `${active.model || '未填型号'} · ${text}`, error: failed } }));
      if (failed) { setError(text); setMessage(''); } else { setMessage(text); setError(''); }
    };
    setTesting(true); setTestingRole(roleId); setSaved(false); report('正在测试，只发送一次短请求…');
    const start = performance.now();
    const controller = new AbortController();
    probeRef.current = controller;
    const timer = window.setTimeout(() => controller.abort('timeout'), active.timeoutSeconds * 1000);
    try {
      const request = buildProbeRequest(active.adapter, safeUrl(active.baseUrl), active.model.trim(), keys[roleId]?.trim() || '');
      const response = await fetch(request.url, { method: 'POST', signal: controller.signal, headers: request.headers, body: JSON.stringify(request.body), credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (probeRef.current !== controller) return;
      if (!response.ok) {
        const elapsedMs = Math.round(performance.now() - start);
        const entry: CallLog = { at: new Date().toISOString(), role: roleTitle, model: active.model.trim(), elapsedMs, outcome: 'failure', status: response.status, errorCode: `HTTP_${response.status}` };
        setLogs(addLog(entry, config.logRetentionDays));
        throw new Error(`服务返回 HTTP ${response.status}。请检查 Base URL、Key、Model ID 和账号权限；响应正文未保存。`);
      }
      const data: unknown = await response.json();
      if (probeRef.current !== controller) return;
      const parsed = parseProbeResponse(active.adapter, data);
      if (!parsed.text.trim()) throw new Error(`服务已响应，但返回格式无法由 ${protocolLabels[active.adapter]} 适配器识别。`);
      const elapsedMs = Math.round(performance.now() - start);
      const entry: CallLog = {
        at: new Date().toISOString(), role: roleTitle, model: active.model.trim(), elapsedMs, outcome: 'success',
        ...(typeof parsed.inputTokens === 'number' ? { inputTokens: parsed.inputTokens } : {}),
        ...(typeof parsed.outputTokens === 'number' ? { outputTokens: parsed.outputTokens } : {}),
      };
      setLogs(addLog(entry, config.logRetentionDays)); report(`连接成功，${elapsedMs} ms。`);
    } catch (reason) {
      if (probeRef.current !== controller) return;
      const messageText = reason instanceof Error ? reason.message : '网络请求失败。';
      if (!messageText.startsWith('服务返回 HTTP')) {
        const entry: CallLog = { at: new Date().toISOString(), role: roleTitle, model: active.model.trim(), elapsedMs: Math.round(performance.now() - start), outcome: 'failure', errorCode: controller.signal.aborted ? controller.signal.reason === 'cancel' ? 'CANCELLED' : 'TIMEOUT' : 'NETWORK_OR_FORMAT' };
        setLogs(addLog(entry, config.logRetentionDays));
      }
      report(controller.signal.aborted ? controller.signal.reason === 'cancel' ? '测试已取消。未自动重试。' : `超过 ${active.timeoutSeconds} 秒，连接已中止。可核对超时与服务商状态后重试。` : messageText.startsWith('服务') ? messageText : '连接未完成。请核对地址、密钥、型号与浏览器跨域策略。', true);
    } finally { window.clearTimeout(timer); if (probeRef.current === controller) { probeRef.current = null; setTesting(false); setTestingRole(null); } }
  }

  function applyBatch() {
    const source = config.roles[batchSource];
    if (!source.baseUrl.trim() || !source.model.trim()) { setError('请先填写来源岗位的 Base URL 与 Model ID。'); setMessage(''); return; }
    try { safeUrl(source.baseUrl); } catch { setError('来源岗位的 Base URL 无效，未应用。'); setMessage(''); return; }
    const targets = batchTargets.filter(id => id !== batchSource);
    if (!targets.length) return;
    setConfig(previous => ({ ...previous, activePresetId: null, roles: Object.fromEntries(roleMeta.map(role => [role.id, targets.includes(role.id) ? { ...previous.roles[role.id], adapter: source.adapter, baseUrl: source.baseUrl, model: source.model } : previous.roles[role.id]])) as AiConfig['roles'] }));
    if (batchWithKey && keys[batchSource]?.trim()) setKeys(previous => ({ ...previous, ...Object.fromEntries(targets.map(id => [id, keys[batchSource]])) }));
    setSaved(false); setError(''); setMessage(`已将接口、协议与型号填入 ${targets.length} 个岗位${batchWithKey && keys[batchSource]?.trim() ? '，密钥仅复制到页面内存' : ''}。岗位开关与生成参数保留；请保存配置。`); setModal(null);
  }

  const visibleProviders = useMemo(() => {
    const query = catalogSearch.trim().toLocaleLowerCase();
    return providerCatalog.filter(provider => !query || [provider.name, provider.region, provider.summary, ...provider.capabilities].join(' ').toLocaleLowerCase().includes(query));
  }, [catalogSearch]);
  function presetEstimate(preset: Preset, rounds = 1) {
    const now = Date.now();
    const freshness = modelRateSnapshotStatus(now);
    if (freshness !== 'current') return freshness === 'expired' ? '快照已过期，待核价' : '日期无法核实，待核价';
    const totals: Record<string, number> = {};
    let unpricedRoles = 0;
    for (const role of roleMeta) {
      const model = preset.models[role.id];
      const usage = estimateUsage[role.id];
      const calls = (Math.max(0, usage.callsPer100) / 100) * Math.max(0, rounds);
      if (calls <= 0) continue;
      const quote = estimateModelCost(model, usage.inputTokens, usage.outputTokens, now);
      if (!quote) { unpricedRoles += 1; continue; }
      totals[quote.currency] = (totals[quote.currency] || 0) + quote.amount * calls;
    }
    const priced = Object.entries(totals).map(([currency, amount]) => `${currency === 'CNY' ? '¥' : '$'}${amount.toFixed(5)}`).join(' + ') || '价格待核';
    return unpricedRoles ? `${priced}（${unpricedRoles} 个岗位缺直连价）` : priced;
  }
  const providerById = (id: string) => providerCatalog.find(provider => provider.id === id);
  const providerDetail = modal?.kind === 'catalog' && modal.view === 'provider' ? providerById(modal.providerId || '') : undefined;
  const inventoryDate = new Date().toLocaleDateString('sv-SE');
  const visibleInventory = useMemo(() => {
    const filtered = filterRouterModels(routerModels, inventorySearch, modal?.kind === 'catalog' && modal.view === 'provider' ? modal.providerId : undefined);
    return filtered.sort((a, b) => inventorySort === 'input' ? (a.inputUsdPerMillion ?? Infinity) - (b.inputUsdPerMillion ?? Infinity)
      : inventorySort === 'output' ? (a.outputUsdPerMillion ?? Infinity) - (b.outputUsdPerMillion ?? Infinity)
        : inventorySort === 'context' ? (b.context ?? -1) - (a.context ?? -1) : a.name.localeCompare(b.name));
  }, [routerModels, inventorySearch, inventorySort, modal]);
  function closeDialog() { if (dialogRef.current?.open) dialogRef.current.close(); setModal(null); }

  return <section className="page ai-page">
    <h1 className="ai-title">AI 设定</h1>
    <p>配置五个岗位的模型与调用方式。密钥只在本页临时使用。</p>
    <div className="ai-start-actions"><button className="provider-open" onClick={() => { setCatalogSearch(''); setModal({ kind: 'catalog', view: 'providers' }); }}><span>⌕</span><span><strong>模型与服务商目录</strong><small>查模型、接入方式与官方价格</small></span><b>打开目录　›</b></button><span className="catalog-date">服务商资料：{catalogVerifiedOn}　·　推荐价格快照：{MODEL_RATE_SNAPSHOT_DATE}（至 {MODEL_RATE_VALID_UNTIL} UTC；仅核验型号估算，目录非全球全集或实时价格）</span></div>
    <button className="comparison-link" onClick={() => setModal({ kind: 'catalog', view: 'comparison' })}><span>价格与能力总览比较</span><span>打开模型比较　›</span></button>
    <div className="recommend-heading"><div><span className="eyebrow">五岗位分别选型</span><h2>青鸟推荐</h2></div><p>先用推荐值起步；每个岗位都能单独改模型、参数和密钥。</p></div>
    {config.activePresetId && presets.find(item => item.id === config.activePresetId) && <div className="active-recipe" role="status"><span className="active-seal">青</span><span><strong>青鸟 · {presets.find(item => item.id === config.activePresetId)!.title}</strong><small>推荐参数已填入。请为启用的岗位填写对应 API Key；高级剧情默认停用。已提交回合可在显式保存后主动生成叙事。</small></span><button className="text-button" onClick={() => setModal({ kind: 'catalog', view: 'providers' })}>打开服务商目录</button></div>}
    <section className="preset-grid" aria-label="青鸟推荐档位">
      {presets.map(preset => <article className={`preset-card ${config.activePresetId === preset.id ? 'preset-active' : ''}`} key={preset.id}><span className="preset-mark">{preset.title.slice(0, 1)}</span><h3>{preset.title}</h3><p>{preset.tone}</p><small>{preset.detail}</small><button className="secondary" onClick={() => setModal({ kind: 'preset', preset })}>{config.activePresetId === preset.id ? '查看已应用档位' : '查看配置与成本'}</button></article>)}
    </section>
    <div className="notice-inline"><strong>开用前看一眼</strong><span>不同地区的账号权限、Model ID 与价格可能不同。请按你开户地区的官方控制台复核；预设不会替你测试连接。</span></div>
    <div className="ai-config-tools"><label className="toggle-line test-permission"><input type="checkbox" checked={config.connectionTestAllowed} onChange={event => { setSaved(false); setConfig(current => ({ ...current, connectionTestAllowed: event.target.checked })); }} />允许连接测试</label><button className="secondary" type="button" onClick={() => { setError(''); setModal({ kind: 'batch' }); }}>批量配置岗位</button></div>
    <p className="quiet-note">连接测试可能产生服务商费用。结果会显示在被测岗位旁；耗时包含接口响应与读取，不会自动重试。</p>
    <section className="role-list" aria-label="五个 AI 岗位">
      {roleMeta.map((role, index) => {
        const active = config.roles[role.id];
        const sampling = modelSamplingPolicy(active.model);
        return <details className="role-panel" key={role.id} open={index === 0 ? undefined : false}>
          <summary><span className="role-index">0{index + 1}</span><span className="role-summary"><strong>{role.title}</strong><small>{role.purpose}</small></span><span className={active.enabled ? (active.model.trim() && active.baseUrl.trim() ? 'role-state enabled' : 'role-state pending') : 'role-state'}>{active.enabled ? (active.model.trim() && active.baseUrl.trim() ? '已配置' : '待配置') : '已停用'}</span></summary>
          <div className="role-fields">
            <label className="toggle-line role-toggle"><span>岗位调用</span><input type="checkbox" checked={active.enabled} onChange={event => updateRole(role.id, 'enabled', event.target.checked)} /><span className="switch-visual" aria-hidden="true" /><small>{active.enabled ? '启用' : '停用'}</small></label>
            <label className="setting-field">接口协议<select value={active.adapter} onChange={event => updateRole(role.id, 'adapter', event.target.value as ProtocolId)}>{Object.entries(protocolLabels).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select><small>选与你的服务商文档一致的接口；API 路径和鉴权方式会随协议变化。厂商对采样字段的支持仍可能不同。</small></label>
            <label className="setting-field">Model ID<input value={active.model} onChange={event => updateRole(role.id, 'model', event.target.value)} placeholder="填写服务商控制台显示的 ID" autoComplete="off" /></label>
            <label className="setting-field">Base URL<input value={active.baseUrl} onChange={event => updateRole(role.id, 'baseUrl', event.target.value)} placeholder="https://api.example.com" inputMode="url" autoComplete="url" /><small>填写服务商的 API 根地址，通常无需填写具体操作路径。非本机地址必须使用 HTTPS。</small></label>
            <label className="setting-field">API Key（仅当前页面内存）<input type="password" value={keys[role.id] || ''} onChange={event => setKeys(current => ({ ...current, [role.id]: event.target.value }))} placeholder="粘贴当前岗位使用的密钥" autoComplete="new-password" /><small>不写入存档、设置文件或调用记录；刷新或关闭标签页后需要重输；保存后可供回合叙事使用。不要把密钥发给协作者或提交到 Git。</small></label>
            <ModelPicker protocol={active.adapter} baseUrl={active.baseUrl} apiKey={keys[role.id] || ''} model={active.model} onSelect={id => updateRole(role.id, 'model', id)} />
            <div className="number-grid">
              <label className="setting-field">Temperature<input type="number" min="0" max="2" step="0.05" value={active.temperature} disabled={!sampling.supported.temperature} onChange={event => updateRole(role.id, 'temperature', clampNumber(event.target.value, 0, 2, active.temperature))} />{!sampling.supported.temperature && <small>由该型号的默认设置控制。</small>}</label>
              <label className="setting-field">TopP<input type="number" min="0" max="1" step="0.01" value={active.topP} disabled={!sampling.supported.topP} onChange={event => updateRole(role.id, 'topP', clampNumber(event.target.value, 0, 1, active.topP))} />{!sampling.supported.topP && <small>由该型号的默认设置控制。</small>}</label>
              <label className="setting-field">最大回复 tokens<input type="number" min="128" max="131072" step="128" value={active.maxTokens} onChange={event => updateRole(role.id, 'maxTokens', clampNumber(event.target.value, 128, 131072, active.maxTokens, true))} /></label>
              <label className="setting-field">超时（秒）<input type="number" min="5" max="600" step="5" value={active.timeoutSeconds} onChange={event => updateRole(role.id, 'timeoutSeconds', clampNumber(event.target.value, 5, 600, active.timeoutSeconds, true))} /></label>
            </div>
            <details className="advanced-fields"><summary>更多生成选项与服务细节</summary><div className="number-grid">
              <label className="setting-field">Top K<input type="number" min="0" max="500" value={active.topK} disabled={!sampling.supported.topK} onChange={event => updateRole(role.id, 'topK', clampNumber(event.target.value, 0, 500, active.topK, true))} /><small>{sampling.supported.topK ? '0 表示不指定；部分服务商不支持。' : '由该型号的默认设置控制。'}</small></label>
              <label className="setting-field">Frequency Penalty<input type="number" min="-2" max="2" step="0.05" value={active.frequencyPenalty} onChange={event => updateRole(role.id, 'frequencyPenalty', clampNumber(event.target.value, -2, 2, active.frequencyPenalty))} /></label>
              <label className="setting-field">Presence Penalty<input type="number" min="-2" max="2" step="0.05" value={active.presencePenalty} onChange={event => updateRole(role.id, 'presencePenalty', clampNumber(event.target.value, -2, 2, active.presencePenalty))} /></label>
              <label className="setting-field">Repetition Penalty<input type="number" min="0" max="2" step="0.05" value={active.repetitionPenalty} onChange={event => updateRole(role.id, 'repetitionPenalty', clampNumber(event.target.value, 0, 2, active.repetitionPenalty))} /><small>非所有 API 采用相同范围与语义。</small></label>
              <label className="setting-field">Seed（可选）<input type="number" min="0" max="2147483647" value={active.seed ?? ''} placeholder="留空：由服务端决定" onChange={event => updateRole(role.id, 'seed', event.target.value === '' ? null : clampNumber(event.target.value, 0, 2_147_483_647, 0, true))} /><small>同一 Seed 不保证跨版本或跨服务商完全复现。</small></label>
              <label className="setting-field">期望上下文上限（tokens）<input type="number" min="1024" max="2000000" step="1024" value={active.contextWindowTokens} onChange={event => updateRole(role.id, 'contextWindowTokens', clampNumber(event.target.value, 1024, 2_000_000, active.contextWindowTokens, true))} /><small>记录你的目标预算；不是供应商承诺值，也不会自动截断剧情。</small></label>
              <label className="setting-field">输出格式<select value={active.responseFormat} onChange={event => updateRole(role.id, 'responseFormat', event.target.value as RoleConfig['responseFormat'])}><option value="text">普通文本</option><option value="json_object">JSON 对象</option></select><small>结构化结果仍须通过游戏规则验证。</small></label>
              <label className="setting-field">推理强度<select value={active.reasoningEffort} onChange={event => updateRole(role.id, 'reasoningEffort', event.target.value as RoleConfig['reasoningEffort'])}><option value="default">服务商默认</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><small>只有支持该参数的型号才能使用。</small></label>
              <label className="toggle-line"><input type="checkbox" checked={active.streaming} onChange={event => updateRole(role.id, 'streaming', event.target.checked)} />期望使用流式输出</label>
              <label className="setting-field advanced-wide">停止序列（每行一项）<textarea rows={3} maxLength={1000} value={active.stopSequences} onChange={event => updateRole(role.id, 'stopSequences', event.target.value.slice(0, 1000))} placeholder="留空表示不设置" /><small>不同服务商支持情况不同；当前仅保存，不会发送。</small></label>
            </div>{sampling.note && <p className="quiet-note" role="note">{sampling.note}</p>}<p className="quiet-note">采样值目前只保存为本地草案；已提交回合可主动使用保存的岗位配置生成叙事；延期草案不会发送。受限型号省略这些字段；未知 Model ID 仍须按服务商文档核对。</p><p className="quiet-note">世界 Canon、规则和状态契约不开放给自由提示词或正则表达式改写。模型不得凭输出直接改变生命、物品、任务等权威状态。</p></details>
            <div className="role-probe"><label className="toggle-line"><input type="checkbox" checked={config.connectionTestAllowed} onChange={event => { setSaved(false); setConfig(current => ({ ...current, connectionTestAllowed: event.target.checked })); }} />允许连接测试（{role.title}）</label><div className="connection-row"><span>该岗位的连接测试</span><button className="secondary" onClick={() => void testConnection(role.id)} disabled={testing || !config.connectionTestAllowed || !active.enabled}>{testingRole === role.id ? '测试中…' : '测试此岗位'}</button>{testingRole === role.id && <button className="quiet-action" onClick={() => probeRef.current?.abort('cancel')}>取消测试</button>}</div>{probeResults[role.id] && <p className={probeResults[role.id]!.error ? 'error' : 'status-message'} role="status">{probeResults[role.id]!.text}</p>}</div>
          </div>
        </details>;
      })}
    </section>
    <section className="card settings-card"><h3>全局调度与隐私</h3><div className="number-grid">
      <label className="setting-field">调用记录最长保留（天）<select value={config.logRetentionDays} onChange={event => setConfig(current => ({ ...current, logRetentionDays: Number(event.target.value) }))}><option value="0">不保存</option><option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option></select><small>只保存在当前标签页会话的 sessionStorage 中；关闭标签页后可能提前清除。所选天数是到期上限。</small></label>
      <label className="setting-field">世界档案整理周期（回合）<input type="number" min="1" max="100" value={config.archiveInterval} onChange={event => setConfig(current => ({ ...current, archiveInterval: clampNumber(event.target.value, 1, 100, config.archiveInterval, true) }))} /></label>
      <label className="setting-field">近期上下文消息数<input type="number" min="0" max="120" value={config.contextCount} onChange={event => setConfig(current => ({ ...current, contextCount: clampNumber(event.target.value, 0, 120, config.contextCount, true) }))} /></label>
      <label className="setting-field">失败后重试次数<input type="number" min="0" max="3" value={config.retryCount} onChange={event => setConfig(current => ({ ...current, retryCount: clampNumber(event.target.value, 0, 3, config.retryCount, true) }))} /><small>仅供后续回合调度使用；当前设置页不会自动重试连接测试。</small></label>
      <label className="setting-field">重试间隔（秒）<input type="number" min="1" max="30" value={config.retryDelaySeconds} onChange={event => setConfig(current => ({ ...current, retryDelaySeconds: clampNumber(event.target.value, 1, 30, config.retryDelaySeconds, true) }))} /><small>后续将用有上限的退避；超时或结算后不会盲目重放。</small></label>
    </div><p className="quiet-note">调用记录仅包含岗位、Model ID、时间、耗时、HTTP 状态和服务商返回的 token 统计。不记录 API Key、提示词、剧情正文或响应正文。重试、上下文预算与采样字段尚未接入游戏回合。</p></section>
    <section className="card settings-card legacy-migration-card"><div className="migration-heading"><span aria-hidden="true" className="migration-seal">迁</span><div><h3>旧配置迁移</h3><p>只从当前浏览器会话读取旧 AI 配置。旧 HTML 文件与本网站来源隔离，旧存档 JSON 也不包含 API 设置。</p></div></div><div className={migrationPossible ? 'migration-status found' : 'migration-status'}><span className="migration-status-dot"/><div><strong>{migrationPossible ? '发现可读取的旧配置' : '当前浏览器未发现旧配置'}</strong><small>{migrationPossible ? '载入后先核对，再自行保存。原配置会保留。' : '如果旧配置只存在于 file:// 页面，请手动录入服务商地址、Model ID 与密钥。'}</small></div></div><label className="toggle-line migration-consent"><input type="checkbox" checked={config.allowLegacyMigration} onChange={event => setConfig(current => ({ ...current, allowLegacyMigration: event.target.checked }))} /><span><strong>允许读取并迁入表单</strong><small>读取前需要明确开启；密钥仅放入当前页面内存，不会写入新设置或存档。</small></span><span className="switch-visual" aria-hidden="true"/></label><div className="migration-footer"><button className="secondary" onClick={importLegacy} disabled={!config.allowLegacyMigration || !migrationPossible}>读取旧配置到表单</button><span>不会删除旧配置，也不会自动发起连接测试。</span></div></section>
    {createPortal(<div className="ai-actionbar" aria-label="AI 设置操作"><div className="ai-feedback">{error ? <p className="error" role="alert">{error}</p> : message ? <p className={saved ? 'success' : 'status-message'} role="status">{message}</p> : <span>密钥只在本页临时使用</span>}</div><button className="primary" onClick={save}>保存配置</button><button className="secondary" onClick={() => setModal({ kind: 'logs' })}>调用记录</button><button className="secondary" onClick={onClose}>关闭</button></div>, document.body)}
    <dialog ref={dialogRef} className="glass-dialog" onClose={() => setModal(null)} aria-labelledby="ai-modal-title">
      <button className="dialog-close" onClick={closeDialog} aria-label="关闭窗口">×</button>
      <div className="dialog-scroll-region" key={modal?.kind === 'catalog' ? `${modal.view}-${modal.providerId || ''}` : modal?.kind}>
        {modal?.kind === 'batch' && <><div className="dialog-heading"><h2 id="ai-modal-title">批量配置岗位</h2><p>只复制协议、Base URL、Model ID 和所选密钥。各岗位开关与生成参数保留。</p></div><label className="setting-field">从哪个岗位复制<select value={batchSource} onChange={event => setBatchSource(event.target.value as RoleId)}>{roleMeta.map(role => <option key={role.id} value={role.id}>{role.title}</option>)}</select></label><p className="batch-preview">接口：{config.roles[batchSource].baseUrl || '未填写'}<br />型号：{config.roles[batchSource].model || '未填写'}<br />协议：{protocolLabels[config.roles[batchSource].adapter]}</p><fieldset className="batch-targets"><legend>覆盖以下岗位的接口与型号</legend>{roleMeta.filter(role => role.id !== batchSource).map(role => <label className="toggle-line" key={role.id}><input type="checkbox" checked={batchTargets.includes(role.id)} onChange={event => setBatchTargets(previous => event.target.checked ? [...previous, role.id] : previous.filter(id => id !== role.id))} />{role.title}</label>)}</fieldset><label className="toggle-line"><input type="checkbox" checked={batchWithKey} onChange={event => setBatchWithKey(event.target.checked)} />同时复制来源岗位的密钥（仅页面内存）</label><p className="quiet-note">{keys[batchSource]?.trim() ? '来源岗位已输入密钥，预览不会显示密钥。' : '来源岗位没有密钥，目标岗位现有密钥将保留。'}不自动保存，不发起连接测试。</p><button className="primary" disabled={!batchTargets.some(id => id !== batchSource)} onClick={applyBatch}>确认覆盖所选岗位</button></>}
        {modal?.kind === 'catalog' && modal.view === 'providers' && <>
          <div className="dialog-heading"><span className="eyebrow">服务商</span><h2 id="ai-modal-title">模型与服务商目录</h2></div>
          <label className="catalog-search">查找厂商<input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="输入厂商名称" autoFocus /></label>
          <div className="directory-toolbar"><button className="comparison-link" onClick={() => setModal({ kind: 'catalog', view: 'comparison' })}><span>价格与能力总览比较</span><span>模型表与参考指标　›</span></button></div>
          <nav className="provider-name-list" aria-label="服务商列表，可滚动浏览">
            {visibleProviders.map(provider => <button key={provider.id} data-provider-id={provider.id} onClick={() => { catalogReturnProviderRef.current = provider.id; setModal({ kind: 'catalog', view: 'provider', providerId: provider.id }); }}><span>{provider.name}</span><span aria-hidden="true">›</span></button>)}
            {!visibleProviders.length && <p className="quiet-note">没有找到这个名称。</p>}
          </nav>
        </>}
        {modal?.kind === 'catalog' && modal.view === 'provider' && providerDetail && <>
          <div className="dialog-heading detail-heading"><button className="back-link" onClick={() => setModal({ kind: 'catalog', view: 'providers' })}>‹　服务商</button><span className="eyebrow">{providerDetail.region} · {providerDetail.compatibility}</span><h2 id="ai-modal-title" tabIndex={-1}>{providerDetail.name}</h2><p>{providerDetail.summary}</p></div>
          <div className="provider-detail-body">
            <div className="provider-tags">{providerDetail.capabilities.map(tag => <span key={tag}>{tag}</span>)}</div>
            <div className="provider-links detail-links">{providerDetail.keyUrl && <a href={providerDetail.keyUrl} target="_blank" rel="noreferrer">申请 API Key ↗</a>}{providerDetail.docsUrl && <a href={providerDetail.docsUrl} target="_blank" rel="noreferrer">API 文档 ↗</a>}{providerDetail.pricingUrl && <a href={providerDetail.pricingUrl} target="_blank" rel="noreferrer">官方型号与价格 ↗</a>}</div>
            <div className="inventory-heading"><div><strong>当前可查型号</strong><small>来自 OpenRouter 当前公开市场目录，包含该市场托管的型号；不等于厂商直连账号的授权清单。</small></div><label>筛选<input value={inventorySearch} onChange={event => setInventorySearch(event.target.value)} placeholder="型号、任务特点" /></label></div>
            <p className="compatibility-note">下表列的是 OpenRouter 路由 slug。它们用于 OpenRouter Base URL；若直连本厂商，Model ID 可能不同，请以该平台的控制台或型号 API 为准。</p>
            <p className="table-scroll-hint">表格可横向滑动。价格为 OpenRouter 市场美元快照，直连报价请核对厂商价目页。</p>
            {inventoryLoading && <p className="quiet-note" role="status">正在读取当前市场目录…</p>}
            {inventoryError && <p className="error" role="alert">{inventoryError} 可能是网络或浏览器跨域限制，请重试或打开来源目录。</p>}
            <div className="model-table-wrap"><table className="model-table"><caption>{providerDetail.name} · OpenRouter 托管目录 · 查询于 {inventoryDate}</caption><thead><tr><th>OpenRouter 路由 slug</th><th>型号说明（服务方提供）</th><th><button className="table-sort" onClick={() => setInventorySort('input')}>输入价 / 1M USD ↕</button></th><th><button className="table-sort" onClick={() => setInventorySort('output')}>输出价 / 1M USD ↕</button></th><th><button className="table-sort" onClick={() => setInventorySort('context')}>上下文 ↕</button></th><th>型号页</th></tr></thead><tbody>{visibleInventory.map(model => <tr key={model.id}><td><code>{model.id}</code><small>{model.name}</small></td><td>{model.description || '暂缺服务方型号说明；请查看官方文档。'}</td><td>{model.inputUsdPerMillion === null ? '未公开' : `$${model.inputUsdPerMillion.toPrecision(4)}`}</td><td>{model.outputUsdPerMillion === null ? '未公开' : `$${model.outputUsdPerMillion.toPrecision(4)}`}</td><td>{model.context?.toLocaleString() || '未列明'}</td><td><a href={model.source} target="_blank" rel="noreferrer">查看 ↗</a></td></tr>)}</tbody></table></div>
            {!inventoryLoading && !visibleInventory.length && <p className="quiet-note">目录中没有匹配型号。若此处是模型托管或聚合平台，OpenRouter 的模型作者目录无法列出它所托管的完整清单；请核对上方平台控制台与官方型号页。</p>}
            <p className="quiet-note">本页不把聚合市场型号冒充为直连 API 型号。区域、账户权限、上下文档位、批处理折扣、缓存和实时价格可能不同；最终以所用服务端价目页与账户返回目录为准。</p>
          </div>
        </>}
        {modal?.kind === 'catalog' && modal.view === 'comparison' && <>
          <div className="dialog-heading detail-heading"><button className="back-link" onClick={() => setModal({ kind: 'catalog', view: 'providers' })}>‹　服务商目录</button><span className="eyebrow">公开资料 · 分项比较</span><h2 id="ai-modal-title">价格与能力总览比较</h2><p>先看价格，再看人群偏好和服务条件。不同榜单测的不是同一件事。</p></div>
          <div className="comparison-body">
            <div className="comparison-sources"><a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer"><strong>Artificial Analysis</strong><span>综合评测、速度、价格与方法说明 ↗</span></a><a href="https://arena.ai/leaderboard/text/english" target="_blank" rel="noreferrer"><strong>Arena</strong><span>用户盲测偏好榜；英文文本榜，非修仙叙事专项 ↗</span></a><a href="https://www.aicpb.com/ai-rankings/models/llm" target="_blank" rel="noreferrer"><strong>AICPB</strong><span>第三方型号与价格索引；核对其来源日期 ↗</span></a></div>
            <p className="table-scroll-hint">表格可横向滑动，查看完整型号与价格。</p>
            <div className="inventory-heading"><div><strong>在 OpenRouter 上架的文本输出型号</strong><small>按 API 当前目录列出；具体上游提供方、路由、可用地区与数据政策需逐条复核。</small></div><label>查找模型<input value={inventorySearch} onChange={event => setInventorySearch(event.target.value)} placeholder="名称、厂商或能力关键词" /></label></div>
            <div className="comparison-controls"><label>排序<select value={inventorySort} onChange={event => setInventorySort(event.target.value as typeof inventorySort)}><option value="name">名称</option><option value="input">输入价格：低到高</option><option value="output">输出价格：低到高</option><option value="context">上下文：高到低</option></select></label><span>{inventoryLoading ? '正在更新目录…' : `当前目录 ${visibleInventory.length.toLocaleString()} 项`}</span></div>
            {inventoryError && <p className="error" role="alert">{inventoryError} 请稍后重试，或前往 OpenRouter 官方目录。</p>}
            <p className="table-scroll-hint">表格可横向滑动；输入和输出价格分开计，描述由服务方或聚合平台提供。</p>
            <div className="model-table-wrap"><table className="model-table comparison-table"><caption>OpenRouter 市场目录 · 查询于 {inventoryDate} · USD / 百万 tokens</caption><thead><tr><th>模型 / 提供方</th><th>型号说明与擅长方向</th><th>输入价</th><th>输出价</th><th>上下文</th><th>来源与可调用性</th></tr></thead><tbody>{visibleInventory.map(model => <tr key={model.id}><td><strong>{model.name}</strong><small>{model.id}</small></td><td>{model.description || '提供方暂未提交详细说明。能力需通过同一任务集实测。'}</td><td>{model.inputUsdPerMillion === null ? '未公开' : `$${model.inputUsdPerMillion.toPrecision(4)}`}</td><td>{model.outputUsdPerMillion === null ? '未公开' : `$${model.outputUsdPerMillion.toPrecision(4)}`}</td><td>{model.context?.toLocaleString() || '未列明'}</td><td><a href={model.source} target="_blank" rel="noreferrer">OpenRouter 型号页 ↗</a><small>{model.expiration ? `有效期至 ${model.expiration}` : '聚合市场当前列出'}</small></td></tr>)}</tbody></table></div>
            <p className="quiet-note">价格是 OpenRouter 聚合市场的公开目录价，不是各厂商直连报价；也不涵盖语音、图片、视频、嵌入和重排等专用 API。型号可用性可能因账户、地区、上游路由而异。价格单位原始为 USD/token，界面换算为 USD/百万 tokens；不包含缓存、批处理、工具、税费或人民币汇率。</p>
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
            <small>价格快照索引：{MODEL_RATE_SNAPSHOT_DATE}（至 {MODEL_RATE_VALID_UNTIL} UTC）；每个型号仍以条目所列核验日和计费档为准。DeepSeek 取直连峰时未命中缓存价；阿里云按 Global 标准档且单次输入不超过 1M tokens；火山方舟按中国大陆在线文本标准档；OpenAI 按短上下文标准价，输入超过 272K tokens 时应用长上下文档。Gemini 3.8 Flash 促销价仅至 2026-12-31，2027-01-01 起停止估算，避免提前沿用新价。美元、人民币分列。输入输出 token 数由你填写；思考 token 也可能计入输出用量。未核验、过期或区域不符的价格不估算，不以零代替。缓存、地域/接入点差异、阶梯价、折扣、税费、工具费和失败请求未计；这不是账单。价格来源：<a href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noreferrer">DeepSeek</a> · <a href="https://docs.volcengine.com/docs/ark/model-pricing?lang=zh" target="_blank" rel="noreferrer">火山方舟</a> · <a href="https://help.aliyun.com/en/model-studio/model-pricing" target="_blank" rel="noreferrer">阿里云</a> · <a href="https://platform.kimi.ai/" target="_blank" rel="noreferrer">Kimi</a> · <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">OpenAI</a> · <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noreferrer">Anthropic</a> · <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Google</a></small></section>
        </>
        }
        {modal?.kind === 'logs' && <>
          <div className="dialog-heading detail-heading"><span className="eyebrow">本浏览器 · 脱敏元数据</span><h2 id="ai-modal-title">调用记录</h2><p>仅显示岗位、型号、耗时、状态与服务商报告的 token 数。不保存密钥、提示词、剧情或响应正文。</p></div>
          <section className="call-log-dialog-body" aria-label="模型连接测试记录">
            <div className="logs-heading"><span>{logs.length ? `保留 ${logs.length} 条 · ${config.logRetentionDays ? `最多 ${config.logRetentionDays} 天` : '当前未设保留'}` : '暂无记录'}</span><button className="secondary" disabled={!logs.length} onClick={() => { if (!window.confirm('清空本浏览器会话中保存的调用记录？')) return; try { sessionStorage.removeItem(LOG_KEY); } catch { /* storage unavailable */ } setLogs([]); }}>清空记录</button></div>
            {logs.length ? <div className="log-list">{logs.slice().reverse().map((log, index) => <article key={`${log.at}-${index}`}><strong>{log.role} · {log.model}</strong><span>{new Date(log.at).toLocaleString()} · {log.elapsedMs} ms · {log.outcome === 'success' ? '成功' : `失败${log.status ? ` / HTTP ${log.status}` : ''}`}</span><small>输入 {log.inputTokens ?? '服务商未报告'} / 输出 {log.outputTokens ?? '服务商未报告'} tokens{log.errorCode ? ` · 错误码 ${log.errorCode}` : ''}</small></article>)}</div> : <div className="logs-empty"><span aria-hidden="true">—</span><strong>尚无调用记录</strong><p>允许连接测试并完成一次连接检查后，脱敏结果会显示在这里。</p></div>}
          </section>
        </>}
      </div>
      {modal?.kind === 'preset' && <div className="dialog-actions"><button className="secondary" onClick={closeDialog}>返回修改</button><button className="primary" onClick={() => applyPreset(modal.preset)}>应用此方案</button></div>}
    </dialog>
  </section>;
}

function suggestedSnapshotModel(providerId: string, available: AvailableModel[]): string {
  if (modelRateSnapshotStatus() !== 'current') return '';
  for (const preset of presets) {
    for (const role of roleMeta) {
      const candidate = preset.models[role.id];
      if (preset.providers[role.id] === providerId && available.some(model => model.id === candidate)) return candidate;
    }
  }
  return '';
}

function BeginnerAiSetup({ onBack, onProfessional, onClose }: { onBack: () => void; onProfessional: () => void; onClose: () => void }) {
  const [providerId, setProviderId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [modelStatus, setModelStatus] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedConfig, setSavedConfig] = useState<AiConfig | null>(null);
  const [connectionState, setConnectionState] = useState<'not-tested' | 'testing' | 'success' | 'failed'>('not-tested');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [step, setStep] = useState<'provider' | 'configure' | 'complete'>('provider');
  const modelRequest = useRef<AbortController | null>(null);
  const testRequest = useRef<AbortController | null>(null);

  const provider = providerCatalog.find(item => item.id === providerId);
  const protocol = providerId ? beginnerProtocolByProvider[providerId] : undefined;
  const baseUrl = providerId ? providerDefaults[providerId] : '';
  const effectiveModel = selectedModel || manualModel.trim();
  const rateStatus = modelRateSnapshotStatus();
  const providerChoices = useMemo(() => beginnerProviders, []);

  useEffect(() => () => {
    modelRequest.current?.abort('unmount'); modelRequest.current = null;
    testRequest.current?.abort('unmount'); testRequest.current = null;
  }, []);
  useEffect(() => {
    const suggestion = suggestedSnapshotModel(providerId, models);
    if (suggestion) setSelectedModel(suggestion);
    else if (models.length === 1 && models[0]) setSelectedModel(models[0].id);
    else setSelectedModel('');
    setManualModel('');
  }, [providerId, models]);

  function chooseProvider(nextId: string) {
    modelRequest.current?.abort('provider-changed'); modelRequest.current = null; setLoadingModels(false);
    setProviderId(nextId); setApiKey(''); setModels([]); setSelectedModel(''); setManualModel('');
    setModelStatus(''); setLoadingError(''); setSaveError(''); setStep('configure');
  }

  async function loadModels() {
    if (!provider || !protocol || !baseUrl || !apiKey.trim() || modelRequest.current) return;
    const controller = new AbortController(); modelRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort('timeout'), 15_000);
    setLoadingModels(true); setModels([]); setSelectedModel(''); setManualModel(''); setLoadingError('');
    setModelStatus('正在向所选服务商读取这个账号可用的型号…');
    try {
      const result = await fetchAvailableModels(protocol, baseUrl, apiKey.trim(), controller.signal);
      if (modelRequest.current !== controller) return;
      setModels(result);
      setModelStatus(result.length ? `读取到 ${result.length} 个型号。型号可见不代表账号一定能调用；最终以连接测试和服务商权限为准。` : '服务商没有返回型号列表。你可以展开“手动填写”，或改用专业模式。');
    } catch (reason) {
      if (modelRequest.current !== controller) return;
      setLoadingError(controller.signal.aborted
        ? controller.signal.reason === 'cancel' ? '已取消读取。你可以重新读取，或在下方手动填写型号。' : '读取超过 15 秒，已自动停止。请检查网络后重试，或在下方手动填写型号。'
        : reason instanceof Error && reason.message.startsWith('型号列表返回 HTTP') ? reason.message : '暂时无法读取型号列表。请核对 Key 和网络，或使用专业模式手动配置。');
      setModelStatus('型号列表未读取成功；不会猜测一个型号替你配置。');
    } finally {
      window.clearTimeout(timer);
      if (modelRequest.current === controller) { modelRequest.current = null; setLoadingModels(false); }
    }
  }

  function saveConfiguration() {
    setSaveError('');
    if (!provider || !protocol || !baseUrl) { setSaveError('请先选择服务商。'); return; }
    if (!apiKey.trim()) { setSaveError('请粘贴这个服务商提供的 API Key。密钥只用于当前页面运行，不会写入设置或调用记录。'); return; }
    if (!effectiveModel) { setSaveError('请选择账号返回的型号，或在“手动填写”中输入控制台显示的型号名称。'); return; }
    let normalizedUrl = '';
    try { normalizedUrl = safeUrl(baseUrl); } catch { setSaveError('当前服务商连接地址无法用于快速配置，请转到专业模式核对。'); return; }

    const current = readConfig();
    const roles = Object.fromEntries(roleMeta.map(role => [role.id, {
      ...current.roles[role.id],
      enabled: role.id !== 'premiumDirector',
      model: effectiveModel,
      baseUrl: normalizedUrl,
      adapter: protocol,
    }])) as AiConfig['roles'];
    const next: AiConfig = { ...current, uiMode: 'beginner', activePresetId: null, roles };
    const roleKeys = Object.fromEntries(roleMeta.map(role => [role.id, apiKey.trim()])) as Partial<Record<RoleId, string>>;
    try {
      sessionStorage.setItem(CONFIG_KEY, JSON.stringify(safeConfig(next)));
      armPageNarrative(next.roles, roleKeys, (row, elapsedMs) => {
        addLog({ at: new Date().toISOString(), role: row.role, model: next.roles[row.role].model, elapsedMs,
          outcome: row.status === 'received' ? 'success' : 'failure',
          ...(row.status === 'received' ? row.reportedOutputTokens === null ? {} : { outputTokens: row.reportedOutputTokens } : { errorCode: 'NETWORK_OR_FORMAT' }) }, next.logRetentionDays);
      });
      setSavedConfig(next); setConnectionState('not-tested'); setConnectionMessage(''); setStep('complete');
    } catch {
      setSaveError('当前浏览器无法保存设置。请检查浏览器会话存储权限；密钥仍只在当前页面内存中。');
    }
  }

  async function testMainRole() {
    if (!savedConfig || connectionState === 'testing' || testRequest.current) return;
    const active = savedConfig.roles.story;
    if (!apiKey.trim() || !active.model || !active.baseUrl) { setConnectionState('failed'); setConnectionMessage('缺少连接信息，请返回上一步补全。'); return; }
    const controller = new AbortController(); testRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort('timeout'), active.timeoutSeconds * 1000);
    const started = performance.now(); setConnectionState('testing'); setConnectionMessage('正在测试主剧情岗位，只发送一次短请求…');
    try {
      const request = buildProbeRequest(active.adapter, safeUrl(active.baseUrl), active.model, apiKey.trim());
      const response = await fetch(request.url, { method: 'POST', signal: controller.signal, headers: request.headers, body: JSON.stringify(request.body), credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      const elapsedMs = Math.round(performance.now() - started);
      if (!response.ok) {
        addLog({ at: new Date().toISOString(), role: '主剧情', model: active.model, elapsedMs, outcome: 'failure', status: response.status, errorCode: `HTTP_${response.status}` }, savedConfig.logRetentionDays);
        setConnectionState('failed'); setConnectionMessage(`服务返回 HTTP ${response.status}。请核对密钥、型号权限和服务商状态；响应正文不会保存。`); return;
      }
      const parsed = parseProbeResponse(active.adapter, await response.json());
      if (!parsed.text.trim()) throw new Error('FORMAT');
      addLog({ at: new Date().toISOString(), role: '主剧情', model: active.model, elapsedMs, outcome: 'success',
        ...(typeof parsed.inputTokens === 'number' ? { inputTokens: parsed.inputTokens } : {}),
        ...(typeof parsed.outputTokens === 'number' ? { outputTokens: parsed.outputTokens } : {}) }, savedConfig.logRetentionDays);
      setConnectionState('success'); setConnectionMessage(`主剧情岗位连接测试成功，${elapsedMs} ms。其他岗位尚未分别测试。`);
    } catch {
      if (controller.signal.reason === 'unmount') return;
      const elapsedMs = Math.round(performance.now() - started);
      const cancelled = controller.signal.aborted && controller.signal.reason === 'cancel';
      addLog({ at: new Date().toISOString(), role: '主剧情', model: active.model, elapsedMs, outcome: 'failure', errorCode: cancelled ? 'CANCELLED' : controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_FORMAT' }, savedConfig.logRetentionDays);
      setConnectionState('failed'); setConnectionMessage(cancelled ? '测试已取消；未自动重试。' : controller.signal.aborted ? '测试超时，未自动重试。请核对服务商状态或稍后再试。' : '连接未完成。请核对 Key、型号权限、网络和接口地址。');
    } finally { window.clearTimeout(timer); if (testRequest.current === controller) testRequest.current = null; }
  }

  if (step === 'provider') return <>
    <a className="skip-to-content" href="#ai-beginner-main" onClick={event => { event.preventDefault(); document.getElementById('ai-beginner-main')?.focus(); }}>跳到当前步骤</a>
    <section className="page ai-mode-page ai-beginner-page" id="ai-beginner-main" tabIndex={-1}>
    <div className="ai-beginner-topline"><button className="back-link" type="button" onClick={onBack}>‹　返回模式选择</button><span className="ai-beginner-step">新手设置 · 第 1 步</span></div>
    <h1 className="ai-mode-title">先选你熟悉的 AI 服务商</h1>
    <p className="ai-mode-lead">推荐先选你已有账号、熟悉的服务商。必填项是服务商、API Key 和一个账号可用型号；连接测试可跳过，高级剧情是可选项，默认停用。</p>
    <div className="ai-mode-choice-grid">
      {providerChoices.find(item => item.id === 'deepseek') && <article className="ai-mode-card ai-mode-card-featured">
        <span className="ai-mode-eyebrow">已有 DeepSeek 账号？</span><h2>DeepSeek</h2>
        <p>选一个账号可用的型号，用同一把 Key 填好五个岗位。以后仍可在专业模式逐岗调整。</p>
        <button className="primary" type="button" onClick={() => chooseProvider('deepseek')}>用 DeepSeek 配置五岗</button>
      </article>}
      <article className="ai-mode-card">
        <span className="ai-mode-eyebrow">你已在使用其他服务商</span><h2>选择服务商</h2>
        <label className="ai-beginner-field">服务商<select defaultValue="" onChange={event => { if (event.target.value) chooseProvider(event.target.value); }}>
          <option value="" disabled>选择一个已支持的服务商</option>
          {providerChoices.filter(item => item.id !== 'deepseek').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <p>这里列出可自动填入连接信息的服务商。未列出的服务商、区域地址和自定义接口仍可在专业模式配置，现有能力保持完整。</p>
      </article>
    </div>
    <div className="ai-beginner-actions"><button className="secondary" type="button" onClick={onProfessional}>进入专业模式</button><button className="quiet-action" type="button" onClick={onClose}>先返回，不改设置</button></div>
    </section>
  </>;

  if (step === 'configure') return <>
    <a className="skip-to-content" href="#ai-beginner-main" onClick={event => { event.preventDefault(); document.getElementById('ai-beginner-main')?.focus(); }}>跳到当前步骤</a>
    <section className="page ai-mode-page ai-beginner-page" id="ai-beginner-main" tabIndex={-1}>
    <div className="ai-beginner-topline"><button className="back-link" type="button" onClick={() => { modelRequest.current?.abort(); setStep('provider'); }}>‹　更换服务商</button><span className="ai-beginner-step">新手设置 · 第 2 步</span></div>
    <h1 className="ai-mode-title">让五个岗位共用一个型号</h1>
    <p className="ai-mode-lead">已选：{provider?.name}。先粘贴该服务商发给你的 API Key，再读取账号当前可用的型号。读取列表不会生成剧情；请求会把 Key 发给你选择的服务商。</p>
    {provider?.keyUrl && <p className="ai-beginner-links"><a href={provider.keyUrl} target="_blank" rel="noreferrer">去服务商获取 API Key ↗</a>{provider.docsUrl && <a href={provider.docsUrl} target="_blank" rel="noreferrer">查看官方说明 ↗</a>}</p>}
    <div className="ai-beginner-card">
      <label className="ai-beginner-field"><span>API Key <b className="ai-beginner-tag is-required">必填</b></span><input type="password" autoComplete="new-password" value={apiKey} onChange={event => { modelRequest.current?.abort('key-changed'); modelRequest.current = null; setLoadingModels(false); setApiKey(event.target.value); setModels([]); setSelectedModel(''); setManualModel(''); setModelStatus(''); setLoadingError(''); }} placeholder="粘贴服务商提供的 Key" /><small>只保存在当前页面内存，刷新或关闭页面后需要重新输入。不会写入设置、存档或调用记录。</small></label>
      <div className="ai-beginner-model-row"><button className="secondary" type="button" disabled={!apiKey.trim() || loadingModels} onClick={() => void loadModels()}>{loadingModels ? '正在读取…' : '读取账号可用型号'}</button>{loadingModels && <button className="quiet-action" type="button" onClick={() => modelRequest.current?.abort('cancel')}>取消</button>}</div>
      {modelStatus && <p className="ai-beginner-status" role="status">{modelStatus}</p>}
      {loadingError && <p className="ai-beginner-error" role="alert">{loadingError}</p>}
      {models.length > 0 && <label className="ai-beginner-field"><span>用于五个岗位的型号 <b className="ai-beginner-tag is-required">必选</b></span><select value={selectedModel} onChange={event => { setSelectedModel(event.target.value); setManualModel(''); }}><option value="">请选择账号返回的型号</option>{models.map(item => <option key={item.id} value={item.id}>{item.id}{item.name !== item.id ? ` · ${item.name}` : ''}</option>)}</select><small>列表来自所选服务商账号；能看到型号不保证账号一定有生成权限。五岗共用是便于起步，不代表该型号对五种工作都最佳。</small></label>}
      <details className="ai-beginner-manual"><summary>列表没有返回型号？手动填写（可选备用方式）</summary><label className="ai-beginner-field"><span>控制台显示的型号名称 <b className="ai-beginner-tag is-required">必填</b></span><input value={manualModel} onChange={event => { setManualModel(event.target.value); setSelectedModel(''); }} autoComplete="off" placeholder="按服务商控制台填写" /></label></details>
      {selectedModel && suggestedSnapshotModel(providerId, models) === selectedModel && rateStatus === 'current' && <p className="ai-beginner-note">这是现有青鸟配置快照中出现过的起步候选，不是唯一或最佳型号结论；你可以改选列表中的其他型号。</p>}
      <details className="ai-beginner-connection"><summary>查看自动填写的连接信息</summary><dl><div><dt>接口地址</dt><dd>{baseUrl}</dd></div><div><dt>接口协议</dt><dd>{protocol ? protocolLabels[protocol] : '待确认'}</dd></div><div><dt>服务商目录核验</dt><dd>{catalogVerifiedOn}</dd></div></dl></details>
    </div>
    <div className="ai-beginner-callout"><strong>费用与岗位说明</strong><p>保存时会启用四个基础岗位。高级剧情（可选）用于重要转折和较长场面；默认关闭不影响基础流程。保存后可在专业模式打开第五个岗位；启用并被调用时可能产生额外费用。</p><p>高级剧情已预填配置，但仍保持停用。费用以服务商当前账单为准。</p><p>{rateStatus === 'current' ? `项目价格快照核验日期：${MODEL_RATE_SNAPSHOT_DATE}；它不是你的账户报价。` : '项目价格快照已过期或无法核实，金额按未知处理。'}</p></div>
    {saveError && <p className="ai-beginner-error" role="alert">{saveError}</p>}
    <div className="ai-beginner-actions"><button className="secondary" type="button" onClick={onProfessional}>转到专业模式</button><button className="primary" type="button" disabled={!apiKey.trim() || !effectiveModel} onClick={saveConfiguration}>保存并启用基础四岗</button></div>
    </section>
  </>;

  return <>
    <a className="skip-to-content" href="#ai-beginner-main" onClick={event => { event.preventDefault(); document.getElementById('ai-beginner-main')?.focus(); }}>跳到当前步骤</a>
    <section className="page ai-mode-page ai-beginner-page" id="ai-beginner-main" tabIndex={-1}>
    <div className="ai-beginner-topline"><span className="ai-beginner-step">新手设置 · 已完成</span></div>
    <h1 className="ai-mode-title">配置已保存</h1>
    <div className="ai-beginner-callout" role="status"><strong>五个岗位已填写</strong><p>主剧情、剧情导演、状态与记忆、世界档案已启用；高级剧情已配置但保持停用。</p><p>连接状态：{connectionState === 'success' ? '主剧情岗位测试成功；其他岗位未分别测试。' : connectionState === 'failed' ? connectionMessage : '尚未测试。'}</p><p>真实回合使用情况仍需在实际游玩中确认；设置保存不代表真实回合已经完成。</p></div>
    {connectionMessage && <p className={`ai-beginner-status ${connectionState === 'failed' ? 'is-error' : ''}`} role={connectionState === 'failed' ? 'alert' : 'status'}>{connectionMessage}</p>}
    <p className="ai-beginner-note">模型调用会把必要的剧情内容发送给所选服务商。密钥留在当前页面运行内存；刷新后需要重新输入。</p>
    <div className="ai-beginner-actions">{connectionState === 'testing' ? <button className="secondary" type="button" onClick={() => testRequest.current?.abort('cancel')}>取消测试</button> : <button className="secondary" type="button" onClick={() => void testMainRole()}>可选：测试主剧情连接</button>}<button className="primary" type="button" disabled={connectionState === 'testing'} onClick={onClose}>返回并继续</button><button className="quiet-action" type="button" disabled={connectionState === 'testing'} onClick={onProfessional}>进入专业模式</button></div>
    <p className="ai-beginner-footnote">连接测试会发送一次短请求，可能产生服务商费用；不会自动重试。只有主剧情岗位被测试。</p>
    </section>
  </>;
}

export function AiSettings({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<AiSettingsMode | null>(null);
  const [previousMode] = useState(() => readConfig().uiMode);

  function chooseMode(next: AiSettingsMode) {
    const config = readConfig();
    try { sessionStorage.setItem(CONFIG_KEY, JSON.stringify(safeConfig({ ...config, uiMode: next }))); } catch { /* Mode remains usable for this visit when storage is unavailable. */ }
    setMode(next);
  }

  if (mode === 'professional') return <ProfessionalAiSettings onClose={onClose} />;
  if (mode === 'beginner') return <BeginnerAiSetup onBack={() => setMode(null)} onProfessional={() => chooseMode('professional')} onClose={onClose} />;

  return <>
    <a className="skip-to-content" href="#ai-mode-main" onClick={event => { event.preventDefault(); document.getElementById('ai-mode-main')?.focus(); }}>跳到当前步骤</a>
    <section className="page ai-mode-page" id="ai-mode-main" tabIndex={-1}>
    <div className="ai-beginner-topline"><span className="ai-beginner-step">AI 设置</span><button className="quiet-action" type="button" onClick={onClose}>返回</button></div>
    <h1 className="ai-mode-title">选择设置方式</h1>
    <p className="ai-mode-lead">你可以按熟悉程度选择。两种模式使用同一份 AI 配置；新手模式会把现有选项重新排成较短的步骤。</p>
    {previousMode && <p className="ai-beginner-note" role="status">上次使用：{previousMode === 'professional' ? '专业模式' : '新手模式'}。你可以这次改选另一种。</p>}
    <div className="ai-mode-choice-grid">
      <article className="ai-mode-card"><span className="ai-mode-eyebrow">完整控制</span><h2>专业模式</h2><p>进入现有 AI 设置页，继续使用全部五岗位、预设、目录、批量配置、调用记录和高级参数。</p><button className="secondary" type="button" onClick={() => chooseMode('professional')}>进入专业模式</button></article>
      <article className="ai-mode-card ai-mode-card-featured"><span className="ai-mode-eyebrow">少填字段，快速开始</span><h2>新手模式</h2><p>选择熟悉的服务商，用一个 API Key 和一个型号填好五个岗位。高级功能仍保留，可随时转到专业模式。</p><button className="primary" type="button" onClick={() => chooseMode('beginner')}>开始新手设置</button></article>
    </div>
    </section>
  </>;
}
