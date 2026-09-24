import { useEffect, useMemo, useState } from 'react';

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
  temperature: number; topP: number; maxTokens: number; timeoutSeconds: number;
};
type AiConfig = {
  version: 2; roles: Record<RoleId, RoleConfig>; connectionTestAllowed: boolean;
  logRetentionDays: number; allowLegacyMigration: boolean; archiveInterval: number;
  contextCount: number;
};
type CallLog = {
  at: string; role: string; model: string; elapsedMs: number; outcome: 'success' | 'failure';
  status?: number; inputTokens?: number; outputTokens?: number; errorCode?: string;
};
type Preset = { id: string; title: string; tone: string; detail: string; models: Record<RoleId, string>; baseUrls: Partial<Record<RoleId, string>> };

const deepSeekUrl = 'https://api.deepseek.com';
const arkUrl = 'https://ark.cn-beijing.volces.com/api/v3';
const presets: Preset[] = [
  {
    id: 'mist', title: '听雨 · 轻量档', tone: '调用克制，适合体验、联调与短篇游玩。',
    detail: '五岗位先统一使用 DeepSeek 当前 API 标识。是否有额度、可用区域和实际单价，以你的服务商账户为准。',
    models: { story: 'deepseek-flash', director: 'deepseek-flash', stateManager: 'deepseek-flash', archive: 'deepseek-flash', premiumDirector: 'deepseek-flash' },
    baseUrls: { story: deepSeekUrl, director: deepSeekUrl, stateManager: deepSeekUrl, archive: deepSeekUrl, premiumDirector: deepSeekUrl },
  },
  {
    id: 'balanced', title: '行云 · 均衡档', tone: '剧情主线采用豆包，结构整理采用 DeepSeek。',
    detail: '适合作为双服务商起点。火山方舟通常还需在控制台准备可用推理接入点；按账号页面显示的 Model ID 与地址核对。',
    models: { story: 'doubao-seed-2-1-pro-260915', director: 'doubao-seed-evolving', stateManager: 'deepseek-flash', archive: 'deepseek-flash', premiumDirector: 'doubao-seed-2-1-pro-260915' },
    baseUrls: { story: arkUrl, director: arkUrl, stateManager: deepSeekUrl, archive: deepSeekUrl, premiumDirector: arkUrl },
  },
  {
    id: 'longform', title: '千章 · 长篇档', tone: '主线保持高叙事能力，状态岗位单独承担提取工作。',
    detail: '这是岗位分配模板，不代表模型质量或价格承诺。先用短测试比较中文文风、稳定性、延迟与实际账单，再决定启用。',
    models: { story: 'doubao-seed-2-1-pro-260915', director: 'doubao-seed-2-1-pro-260915', stateManager: 'deepseek-flash', archive: 'deepseek-flash', premiumDirector: 'doubao-seed-2-1-pro-260915' },
    baseUrls: { story: arkUrl, director: arkUrl, stateManager: deepSeekUrl, archive: deepSeekUrl, premiumDirector: arkUrl },
  },
];

function blankRole(enabled = false): RoleConfig {
  return { enabled, model: '', baseUrl: '', adapter: 'openai-compatible', temperature: 0.7, topP: 0.95, maxTokens: 4096, timeoutSeconds: 90 };
}
function defaults(): AiConfig {
  return {
    version: 2,
    roles: { story: blankRole(true), director: blankRole(false), stateManager: blankRole(false), archive: blankRole(false), premiumDirector: blankRole(false) },
    connectionTestAllowed: false, logRetentionDays: 7, allowLegacyMigration: false,
    archiveInterval: 25, contextCount: 8,
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
        maxTokens: clampNumber(raw.maxTokens, 128, 131072, 4096, true),
        timeoutSeconds: clampNumber(raw.timeoutSeconds, 5, 600, 90, true),
      };
    }
    base.connectionTestAllowed = root.connectionTestAllowed === true;
    base.logRetentionDays = clampNumber(root.logRetentionDays, 0, 90, 7, true);
    base.allowLegacyMigration = root.allowLegacyMigration === true;
    base.archiveInterval = clampNumber(root.archiveInterval, 1, 100, 25, true);
    base.contextCount = clampNumber(root.contextCount, 0, 120, 8, true);
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
  const migrationPossible = useMemo(() => {
    try { return Boolean(sessionStorage.getItem(LEGACY_MULTI_KEY) || sessionStorage.getItem(LEGACY_SINGLE_KEY)); } catch { return false; }
  }, []);

  useEffect(() => { setLogs(readLogs(config.logRetentionDays)); }, [config.logRetentionDays]);
  function updateRole<K extends keyof RoleConfig>(roleId: RoleId, key: K, value: RoleConfig[K]) {
    setConfig(current => ({ ...current, roles: { ...current.roles, [roleId]: { ...current.roles[roleId], [key]: value } } }));
    setSaved(false);
  }
  function setPreset(preset: Preset) {
    setConfig(current => ({
      ...current,
      roles: Object.fromEntries(roleMeta.map(role => [role.id, {
        ...current.roles[role.id], model: preset.models[role.id],
        baseUrl: preset.baseUrls[role.id] || current.roles[role.id].baseUrl,
      }])) as AiConfig['roles'],
    }));
    setError(''); setMessage(`已填入「${preset.title}」五岗位候选值。API Key 不会由档位填入；请逐项核对真实接入点与模型权限。`); setSaved(false);
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

  return <section className="page ai-page">
    <span className="eyebrow">AI 设定 / 青鱼推荐配置</span>
    <h2>让五席各司其职。</h2>
    <p>档位只填写候选 Model ID 与服务地址。密钥需要你亲自接入；当前连接测试可真实调用所选服务，游戏回合尚未接入这套岗位调度，保存的生成参数会在后续阶段启用。</p>
    <section className="preset-grid" aria-label="推荐档位">
      {presets.map(preset => <article className="preset-card" key={preset.id}><span className="preset-mark">{preset.title.slice(0, 1)}</span><h3>{preset.title}</h3><p>{preset.tone}</p><small>{preset.detail}</small><button className="secondary" onClick={() => setPreset(preset)}>填入五席候选</button></article>)}
    </section>
    <div className="notice-inline"><strong>Model ID 需要复核</strong><span>预设来自官方公开模型目录快照，不代表账号已有权限，也不承诺价格或稳定性。实际 Model ID 和计费规则会变动。</span></div>
    <section className="role-list" aria-label="五个 AI 岗位">
      {roleMeta.map((role, index) => {
        const active = config.roles[role.id];
        return <details className="role-panel" key={role.id} open={index === 0 ? undefined : false}>
          <summary><span className="role-index">0{index + 1}</span><span className="role-summary"><strong>{role.title}</strong><small>{role.purpose}</small></span><span className={active.enabled ? (active.model.trim() && active.baseUrl.trim() ? 'role-state enabled' : 'role-state pending') : 'role-state'}>{active.enabled ? (active.model.trim() && active.baseUrl.trim() ? '已配置' : '待配置') : '已停用'}</span></summary>
          <div className="role-fields">
            <label className="toggle-line"><input type="checkbox" checked={active.enabled} onChange={event => updateRole(role.id, 'enabled', event.target.checked)} />启用此岗位</label>
            <label className="setting-field">Model ID<input value={active.model} onChange={event => updateRole(role.id, 'model', event.target.value)} placeholder="填写服务商控制台显示的 ID" autoComplete="off" /></label>
            <label className="setting-field">Base URL<input value={active.baseUrl} onChange={event => updateRole(role.id, 'baseUrl', event.target.value)} placeholder="https://api.example.com" inputMode="url" autoComplete="url" /><small>当前适配器使用 OpenAI Chat Completions 兼容协议。非本机地址必须使用 HTTPS。</small></label>
            <label className="setting-field">API Key（仅当前页面内存）<input type="password" value={keys[role.id] || ''} onChange={event => setKeys(current => ({ ...current, [role.id]: event.target.value }))} placeholder="粘贴当前岗位使用的密钥" autoComplete="new-password" /><small>不写入存档、设置文件或调用记录；离开页面或刷新后需要重输。不要把密钥发给协作者或提交到 Git。</small></label>
            <div className="number-grid">
              <label className="setting-field">Temperature<input type="number" min="0" max="2" step="0.05" value={active.temperature} onChange={event => updateRole(role.id, 'temperature', clampNumber(event.target.value, 0, 2, active.temperature))} /></label>
              <label className="setting-field">TopP<input type="number" min="0" max="1" step="0.01" value={active.topP} onChange={event => updateRole(role.id, 'topP', clampNumber(event.target.value, 0, 1, active.topP))} /></label>
              <label className="setting-field">最大回复 tokens<input type="number" min="128" max="131072" step="128" value={active.maxTokens} onChange={event => updateRole(role.id, 'maxTokens', clampNumber(event.target.value, 128, 131072, active.maxTokens, true))} /></label>
              <label className="setting-field">超时（秒）<input type="number" min="5" max="600" step="5" value={active.timeoutSeconds} onChange={event => updateRole(role.id, 'timeoutSeconds', clampNumber(event.target.value, 5, 600, active.timeoutSeconds, true))} /></label>
            </div>
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
    </div><p className="quiet-note">调用记录仅包含岗位、Model ID、时间、耗时、HTTP 状态和服务商返回的 token 统计。不记录 API Key、提示词、剧情正文或响应正文。</p></section>
    <section className="card settings-card"><h3>旧配置迁移</h3><p>只读取当前站点浏览器会话中的 `jx_ai_config` / `jx1_config`。从 `file://` 旧 HTML 导出的存档不会包含 sessionStorage 配置；跨来源数据需要你另行手动录入。</p><label className="toggle-line"><input type="checkbox" checked={config.allowLegacyMigration} onChange={event => setConfig(current => ({ ...current, allowLegacyMigration: event.target.checked }))} />允许我手动迁移当前浏览器中的旧配置</label><div><button className="secondary" onClick={importLegacy} disabled={!config.allowLegacyMigration || !migrationPossible}>读取旧配置到表单</button>{!migrationPossible && <small className="quiet-note">当前来源没有可检测的旧配置。</small>}</div></section>
    <section className="card settings-card" id="ai-call-logs"><div className="logs-heading"><h3>最近调用记录</h3><button className="secondary" onClick={() => { if (!window.confirm('清空本浏览器会话中保存的调用记录？')) return; try { sessionStorage.removeItem(LOG_KEY); } catch { /* storage unavailable */ } setLogs([]); }}>清空记录</button></div>{logs.length ? <div className="log-list">{logs.slice().reverse().map((log, index) => <article key={`${log.at}-${index}`}><strong>{log.role} · {log.model}</strong><span>{new Date(log.at).toLocaleString()} · {log.elapsedMs} ms · {log.outcome === 'success' ? '成功' : `失败${log.status ? ` / HTTP ${log.status}` : ''}`}</span><small>输入 {log.inputTokens ?? '服务商未报告'} / 输出 {log.outputTokens ?? '服务商未报告'} tokens</small></article>)}</div> : <p className="quiet-note">目前没有保存的调用记录。</p>}</section>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className={saved ? 'success' : 'status-message'} role="status">{message}</p>}
    <div className="ai-actionbar"><button className="primary" onClick={save}>保存配置</button><button className="secondary" onClick={() => document.getElementById('ai-call-logs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>调用记录</button><button className="secondary" onClick={() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); }}>关闭</button></div>
  </section>;
}
