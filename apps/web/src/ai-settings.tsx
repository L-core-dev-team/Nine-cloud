import { useEffect, useMemo, useRef, useState } from 'react';
import { catalogVerifiedOn, providerCatalog } from './ai-provider-catalog';

const CONFIG_KEY = 'jx10_ai_config_v2';
const LOG_KEY = 'jx10_ai_call_log_v1';
const LEGACY_MULTI_KEY = 'jx_ai_config';
const LEGACY_SINGLE_KEY = 'jx1_config';

const roleMeta = [
  { id: 'story', title: '主剧情', purpose: '承接玩家行动，生成剧情正文。' },
  { id: 'director', title: '剧情导演', purpose: '检查节奏、分支和叙事一致性。' },
  { id: 'stateManager', title: '状态与记忆', purpose: '提取结构化状态与记忆候选。' },
  { id: 'archive', title: '世界档案', purpose: '整理长期档案候选；不能直接改写权威状态。' },
  { id: 'premiumDirector', title: '高级剧情', purpose: '只在玩家主动启用时承担高成本叙事。' },
] as const;

type RoleId = typeof roleMeta[number]['id'];
type RoleConfig = {
  enabled: boolean; model: string; baseUrl: string; adapter: 'openai-compatible';
  temperature: number; topP: number; topK: number; frequencyPenalty: number; presencePenalty: number;
  repetitionPenalty: number; seed: number | null; maxTokens: number; timeoutSeconds: number;
};
type AiConfig = {
  version: 2; roles: Record<RoleId, RoleConfig>; connectionTestAllowed: boolean;
  logRetentionDays: number; allowLegacyMigration: boolean; archiveInterval: number;
  contextCount: number; retryCount: number; retryDelaySeconds: number;
  activePresetId: string | null;
};
type CallLog = {
  at: string; role: string; model: string; elapsedMs: number; outcome: 'success' | 'failure';
  status?: number; inputTokens?: number; outputTokens?: number; errorCode?: string;
};
type Preset = { id: string; title: string; tone: string; detail: string; models: Record<RoleId, string>; baseUrls: Partial<Record<RoleId, string>>; temperature: number; topP: number; maxTokens: number };

const deepSeekUrl = 'https://api.deepseek.com';
const arkUrl = 'https://ark.cn-beijing.volces.com/api/v3';
const presets: Preset[] = [
  {
    id: 'mist', title: '听风 · 清简', tone: '轻量起步，优先控制单回合调用量。',
    detail: '五岗位使用 DeepSeek V4.1 Flash；适合先接通服务、校验接口与短段体验。', temperature: 0.75, topP: 0.9, maxTokens: 2048,
    models: { story: 'deepseek-flash', director: 'deepseek-flash', stateManager: 'deepseek-flash', archive: 'deepseek-flash', premiumDirector: 'deepseek-flash' },
    baseUrls: { story: deepSeekUrl, director: deepSeekUrl, stateManager: deepSeekUrl, archive: deepSeekUrl, premiumDirector: deepSeekUrl },
  },
  {
    id: 'balanced', title: '行云 · 均衡', tone: '关键叙事留给强模型，整理任务采用轻量模型。',
    detail: '主剧情与高级剧情使用 DeepSeek V4 Pro，其余岗位使用 V4.1 Flash。需要分别填入同一厂商 API Key。', temperature: 0.8, topP: 0.92, maxTokens: 4096,
    models: { story: 'deepseek-v4-pro', director: 'deepseek-flash', stateManager: 'deepseek-flash', archive: 'deepseek-flash', premiumDirector: 'deepseek-v4-pro' },
    baseUrls: { story: deepSeekUrl, director: deepSeekUrl, stateManager: deepSeekUrl, archive: deepSeekUrl, premiumDirector: deepSeekUrl },
  },
  {
    id: 'longform', title: '登霄 · 沉浸', tone: '提高主线与导演岗位的生成预算，适合长篇尝试。',
    detail: '主剧情、剧情导演与高级剧情使用 DeepSeek V4 Pro；其余岗位使用 V4.1 Flash。成本会随输入历史长度和输出长度上升。', temperature: 0.85, topP: 0.95, maxTokens: 6144,
    models: { story: 'deepseek-v4-pro', director: 'deepseek-v4-pro', stateManager: 'deepseek-flash', archive: 'deepseek-flash', premiumDirector: 'deepseek-v4-pro' },
    baseUrls: { story: deepSeekUrl, director: deepSeekUrl, stateManager: deepSeekUrl, archive: deepSeekUrl, premiumDirector: deepSeekUrl },
  },
];

function blankRole(enabled = false): RoleConfig {
  return { enabled, model: '', baseUrl: '', adapter: 'openai-compatible', temperature: 0.7, topP: 0.95, topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: null, maxTokens: 4096, timeoutSeconds: 90 };
}
function defaults(): AiConfig {
  return {
    version: 2,
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
function safeConfig(config: AiConfig): Omit<AiConfig, 'version'> & { version: 2 } {
  return { ...config, version: 2 };
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
  const [modal, setModal] = useState<{ kind: 'catalog' } | { kind: 'preset'; preset: Preset } | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [dailyRounds, setDailyRounds] = useState(20);
  const [inputPerRole, setInputPerRole] = useState(8000);
  const [outputPerRole, setOutputPerRole] = useState(1000);
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
        ...config.roles[role.id], enabled: true, model: preset.models[role.id],
        baseUrl: preset.baseUrls[role.id] || config.roles[role.id].baseUrl,
        temperature: preset.temperature, topP: preset.topP, maxTokens: preset.maxTokens,
        topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: null,
        timeoutSeconds: 90,
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
  function presetEstimate(preset: Preset) {
    const input = clampNumber(inputPerRole, 1, 1_000_000, 8000);
    const output = clampNumber(outputPerRole, 1, preset.maxTokens, 1000);
    return roleMeta.reduce((sum, role) => {
      const model = preset.models[role.id];
      const inputRate = model === 'deepseek-v4-pro' ? 1.32 : 0.30;
      const outputRate = model === 'deepseek-v4-pro' ? 3.96 : 1.20;
      return sum + (input * inputRate + output * outputRate) / 1_000_000;
    }, 0);
  }
  function closeDialog() { if (dialogRef.current?.open) dialogRef.current.close(); setModal(null); }

  return <section className="page ai-page">
    <span className="eyebrow">AI 设定 / 青鸟荐式</span>
    <h2>让五席各司其职。</h2>
    <p>先选服务商，再按自己的预算和文风配置五个岗位。API Key 只留在当前页面内存；档位不会替你开启连接测试。</p>
    <div className="ai-start-actions"><button className="provider-open" onClick={() => { setCatalogSearch(''); setModal({ kind: 'catalog' }); }}><span>⌕</span><span><strong>模型与服务商目录</strong><small>官方入口、接入方式、型号示例与价格来源</small></span><b>浏览目录　›</b></button><span className="catalog-date">价格与型号参考核验：{catalogVerifiedOn}</span></div>
    {config.activePresetId && presets.find(item => item.id === config.activePresetId) && <div className="active-recipe" role="status"><span className="active-seal">青</span><span><strong>青鸟 · {presets.find(item => item.id === config.activePresetId)!.title}</strong><small>非密钥参数已应用。请自行填入各岗位 API Key；游戏回合调度尚未接入。</small></span><button className="text-button" onClick={() => setModal({ kind: 'catalog' })}>查看服务商目录</button></div>}
    <section className="preset-grid" aria-label="青鸟推荐档位">
      {presets.map(preset => <article className={`preset-card ${config.activePresetId === preset.id ? 'preset-active' : ''}`} key={preset.id}><span className="preset-mark">{preset.title.slice(0, 1)}</span><h3>{preset.title}</h3><p>{preset.tone}</p><small>{preset.detail}</small><button className="secondary" onClick={() => setModal({ kind: 'preset', preset })}>{config.activePresetId === preset.id ? '查看已应用档位' : '查看配置与成本'}</button></article>)}
    </section>
    <div className="notice-inline"><strong>先核对接入条件</strong><span>Model ID、账号权限、Base URL、模型可用区域与计费都可能变化。青鸟档位只提供经核对的示例配置，不替代服务商控制台的最终信息。</span></div>
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
            <details className="advanced-fields"><summary>专业采样与复现选项</summary><div className="number-grid">
              <label className="setting-field">Top K<input type="number" min="0" max="500" value={active.topK} onChange={event => updateRole(role.id, 'topK', clampNumber(event.target.value, 0, 500, active.topK, true))} /><small>0 表示不指定；部分服务商不支持。</small></label>
              <label className="setting-field">Frequency Penalty<input type="number" min="-2" max="2" step="0.05" value={active.frequencyPenalty} onChange={event => updateRole(role.id, 'frequencyPenalty', clampNumber(event.target.value, -2, 2, active.frequencyPenalty))} /></label>
              <label className="setting-field">Presence Penalty<input type="number" min="-2" max="2" step="0.05" value={active.presencePenalty} onChange={event => updateRole(role.id, 'presencePenalty', clampNumber(event.target.value, -2, 2, active.presencePenalty))} /></label>
              <label className="setting-field">Repetition Penalty<input type="number" min="0" max="2" step="0.05" value={active.repetitionPenalty} onChange={event => updateRole(role.id, 'repetitionPenalty', clampNumber(event.target.value, 0, 2, active.repetitionPenalty))} /><small>非所有 API 采用相同范围与语义。</small></label>
              <label className="setting-field">Seed（可选）<input type="number" min="0" max="2147483647" value={active.seed ?? ''} placeholder="留空：由服务端决定" onChange={event => updateRole(role.id, 'seed', event.target.value === '' ? null : clampNumber(event.target.value, 0, 2_147_483_647, 0, true))} /><small>同一 Seed 不保证跨版本或跨服务商完全复现。</small></label>
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
      {modal?.kind === 'catalog' && <>
        <div className="dialog-heading">
          <span className="eyebrow">服务商 / Model ID / 公开计费</span>
          <h2 id="ai-modal-title">模型与服务商目录</h2>
          <p>已收录 25 个常见厂商、云平台、聚合服务与自托管入口。行业没有完整静态清单；通过“自定义 OpenAI 兼容服务”及岗位 Base URL，可按服务商文档扩展。未通过九霄适配器验证的协议不会标成“已支持”。</p>
        </div>
        <label className="catalog-search">
          搜索厂商、地区或能力
          <input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="例如：中文、长上下文、国际" autoFocus />
        </label>
        <div className="provider-list" tabIndex={0} aria-label="服务商目录，可滚动浏览">
          {visibleProviders.map(provider => <article className="provider-card" key={provider.id}>
            <header>
              <div><h3>{provider.name}</h3><span>{provider.region} · {provider.compatibility}</span></div>
              <div className="provider-links">
                {provider.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer">API Key ↗</a>}
                {provider.docsUrl && <a href={provider.docsUrl} target="_blank" rel="noreferrer">官方文档 ↗</a>}
                {provider.pricingUrl && <a href={provider.pricingUrl} target="_blank" rel="noreferrer">价格 ↗</a>}
              </div>
            </header>
            <p>{provider.summary}</p>
            <div className="provider-tags">{provider.capabilities.map(tag => <span key={tag}>{tag}</span>)}</div>
            <div className="model-samples">{provider.models.map(model => <section key={model.id}>
              <strong>{model.id}</strong>
              <small>{model.use}</small>
              {(model.input || model.output) && <span>输入 {model.input}　·　输出 {model.output}</span>}
            </section>)}</div>
          </article>)}
        </div>
        <p className="quiet-note">价格快照核验日：{catalogVerifiedOn}。快照不含账号折扣、免费额度、缓存命中价和税费。请打开来源页确认账户所在区域的最终价格。密钥链接会在新标签页打开。</p>
      </>}
      {modal?.kind === 'preset' && <>
        <div className="dialog-heading">
          <span className="eyebrow">青鸟荐式 · 五岗位候选</span>
          <h2 id="ai-modal-title">{modal.preset.title}</h2>
          <p>{modal.preset.tone} {modal.preset.detail}</p>
        </div>
        <div className="preset-caution">
          <strong>应用会覆盖当前五岗位模型、接入地址与生成参数。</strong>
          <span>API Key 不会被清空或自动填入。连接测试授权保持原样；本次应用需要你再按“应用并启用”。</span>
        </div>
        <div className="preset-role-map">{roleMeta.map(role => <article key={role.id}>
          <span>{role.title}</span>
          <strong>{modal.preset.models[role.id]}</strong>
          <small>DeepSeek API · OpenAI 兼容地址</small>
        </article>)}</div>
        <section className="estimate-box">
          <div>
            <h3>估算一次游历的 API 费用</h3>
            <p>当前岗位引擎尚未接入。下列为规划估算：假设每回合每岗位各调用一次，使用 DeepSeek 峰时公开价，不含缓存、优惠、失败重试与汇率变化。</p>
          </div>
          <div className="estimate-inputs">
            <label>每日游历回合<input type="number" min="1" max="10000" value={dailyRounds} onChange={event => setDailyRounds(clampNumber(event.target.value, 1, 10000, 20, true))} /></label>
            <label>每岗位输入 tokens<input type="number" min="1" max="1000000" value={inputPerRole} onChange={event => setInputPerRole(clampNumber(event.target.value, 1, 1000000, 8000, true))} /></label>
            <label>每岗位输出 tokens<input type="number" min="1" max={modal.preset.maxTokens} value={outputPerRole} onChange={event => setOutputPerRole(clampNumber(event.target.value, 1, modal.preset.maxTokens, 1000, true))} /></label>
          </div>
          <div className="estimate-totals">
            <strong>约 ${presetEstimate(modal.preset).toFixed(5)} / 回合</strong>
            <span>约 ${(presetEstimate(modal.preset) * dailyRounds).toFixed(4)} / 日</span>
            <span>约 ${(presetEstimate(modal.preset) * dailyRounds * 7).toFixed(3)} / 周</span>
          </div>
          <small>每百万 tokens：Flash 输入 $0.30、输出 $1.20；Pro 输入 $1.32、输出 $3.96。账单以服务商实际结算为准。</small>
        </section>
        <div className="dialog-actions">
          <button className="secondary" onClick={closeDialog}>返回修改</button>
          <button className="primary" onClick={() => applyPreset(modal.preset)}>应用并启用此档</button>
        </div>
      </>}
    </dialog>
  </section>;
}
