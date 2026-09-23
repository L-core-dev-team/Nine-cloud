import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';
import { MAX_IMPORT_BYTES, migrateLegacyLibraryText, parseLegacySave } from './legacy';
import { clearDraft, createSaveId, hydrateSaves, readDraft, readLegacyLibraryText, readSaves, writeDraft, writeSaves, type LocalSave } from './storage';
import './style.css';

const roles = ['主剧情', '剧情导演', '状态与记忆', '世界档案', '高级剧情'];
const candidateModel = '请填写实际 Model ID';
const fields = [
  ['name', '姓名', '可留空，由你在提交前确认'], ['age', '年龄', '例如：18 或未知'],
  ['personality', '性格', '例如：冷静谨慎'], ['origin', '身份', '例如：散修'],
  ['realm', '修为', '例如：炼气期'], ['root', '灵根', '例如：天灵根（金）'],
  ['appearance', '外貌', '简短描述即可'], ['talents', '天赋 / 特殊设定', '每行一项，最多三项'],
  ['goal', '补充目标', '例如：只想炼器'], ['region', '开局地域', '中州天枢域'],
] as const;

const route = () => window.location.pathname.replace(/\/+$/, '') || '/';
const go = (path: string) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); };

function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Shell({ children, saves, notice, noticeAction, onImport, onExport }: { children: ReactNode; saves: LocalSave[]; notice: string; noticeAction?: ReactNode; onImport: (file: File) => void; onExport: () => void }) {
  const [menu, setMenu] = useState(false);
  return <div className="jx-shell"><header><button className="brand" onClick={() => go('/')}>九霄<small>1.0 公测构建</small></button><nav><button onClick={() => go('/')}>首页</button><button onClick={() => go('/world')}>世界设定</button><button onClick={() => go('/settings/ai')}>AI 设置</button></nav><button className="menu" aria-expanded={menu} onClick={() => setMenu(open => !open)}>菜单</button></header>{menu && <aside><strong>{saves.length ? `${saves.length} 份本地存档` : '暂无存档'}</strong><button onClick={() => { setMenu(false); go('/new'); }}>新开一局</button><button onClick={() => { setMenu(false); onExport(); }}>导出存档</button><label>导入旧档 / JSON<input type="file" accept=".json,.txt,.html,.htm" onChange={event => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /></label></aside>}{notice && <p className="notice" role="status">{notice} {noticeAction}</p>}<main>{children}</main><footer><span>本地优先 · API 密钥不写入存档</span><span>契约 v{SAVE_SCHEMA_VERSION}</span></footer></div>;
}

function Home({ saves }: { saves: LocalSave[] }) {
  const save = saves[0];
  return <section className="hero"><div><span className="eyebrow">月下山门 · 九霄 1.0</span><h1>先看见路，<br />再踏入世界。</h1><p>《九霄》是一段可保存、可恢复的修仙旅程。每个入口只负责一件事。</p><div className="actions">{save ? <button className="primary" onClick={() => go(`/game/${save.saveId}`)}>继续游玩<span>{save.name} · 第 {save.revision} 回合</span></button> : <button className="primary" onClick={() => go('/new')}>新开一局<span>从角色与地域开始</span></button>}<button className="secondary" onClick={() => go('/world')}>阅读世界设定<span>只读 · 待审核内容</span></button></div><div className="links"><button onClick={() => go('/new')}>创建角色</button><button onClick={() => go('/settings/ai')}>AI 设置</button></div></div><div className="scene" aria-hidden="true"><i className="moon" /><i className="gate" /></div></section>;
}

function NewCharacter({ onSaved }: { onSaved: (save: LocalSave) => void }) {
  const [form, setForm] = useState<Record<string, string>>(readDraft);
  const [error, setError] = useState('');
  useEffect(() => { if (!writeDraft(form)) setError('浏览器暂时无法保存草稿。提交前请保持页面打开。'); }, [form]);
  const set = (key: string, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  function submit() {
    const talents = (form.talents || '').split('\n').map(value => value.trim()).filter(Boolean);
    if (talents.length > 3) { setError('天赋最多三项，请每行填写一项。'); return; }
    const now = new Date().toISOString();
    const name = form.name?.trim() || '无名修士';
    const save: LocalSave = { schemaVersion: 1, saveId: createSaveId(), name, createdAt: now, updatedAt: now, revision: 0, canonVersion: 'pending-author-review', ruleVersion: 'rules-not-signed', memoryPolicyVersion: 'none', character: { ...form, name, talents }, location: form.region || '中州天枢域', status: 'pending_rules', messages: [] };
    if (!writeSaves([save, ...readSaves()])) { setError('浏览器存储空间不足，角色尚未创建。请先导出或清理旧存档。'); return; }
    clearDraft(); onSaved(save);
  }
  return <section className="page"><span className="eyebrow">第一步 / 建角</span><h2>把自己写进山门。</h2><p>先保存角色资料，再进入剧情。规则尚未签署时，游戏会显示待处理状态。</p><div className="form">{fields.map(([key, label, hint]) => <label key={key}>{label}<small>{hint}</small>{key === 'region' ? <select value={form[key] || '中州天枢域'} onChange={event => set(key, event.target.value)}><option>中州天枢域</option><option>北境霜寒域</option><option>南疆万蛊域</option><option>东瀚龙吟域</option><option>西荒梵天域</option><option>完全自定义</option></select> : key === 'talents' || key === 'goal' ? <textarea value={form[key] || ''} onChange={event => set(key, event.target.value)} /> : <input value={form[key] || ''} onChange={event => set(key, event.target.value)} />}</label>)}</div>{error && <p className="error" role="alert">{error}</p>}<div className="actions"><button className="secondary" onClick={() => go('/')}>返回首页</button><button className="primary" onClick={submit}>保存角色并进入<span>本地存档 · 不调用 AI</span></button></div></section>;
}

function World() { return <section className="page"><span className="eyebrow">只读资料 / Canon</span><h2>世界设定</h2><p>世界设定独立于游戏流程。当前仓库只有待作者逐图审核的 OCR 资料，不把未审文字伪装成正式 Canon。</p><div className="card"><strong>公开 Canon 尚未发布</strong><p>待作者 A 提供原图并完成逐条裁定后，世界书才会进入玩家端。</p><button className="secondary" onClick={() => go('/')}>回到首页</button></div></section>; }

function Game({ save, onExport }: { save: LocalSave | undefined; onExport: (save?: LocalSave) => void }) { if (!save) return <section className="page"><h2>找不到这份存档</h2><p>它可能已被删除，或链接来自另一个浏览器。</p><button className="primary" onClick={() => go('/')}>回到首页</button></section>; return <section className="page"><span className="eyebrow">第 {save.revision} 回合 · {save.location}</span><h2>{save.name}</h2><p>角色资料已保存。当前回合等待 S3 规则契约接入，尚未结算任何世界事实。</p><div className="stats"><div><small>角色</small><strong>{save.name}</strong></div><div><small>地域</small><strong>{save.location}</strong></div><div><small>状态</small><strong>待规则接入</strong></div></div><div className="actions"><button className="secondary" onClick={() => go('/world')}>阅读世界设定</button><button className="secondary" onClick={() => onExport(save)}>导出此档</button></div></section>; }

function AiSettings() {
  const [models, setModels] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const setModel = (role: string, value: string) => setModels(previous => ({ ...previous, [role]: value }));
  function applyCandidate() { setModels(Object.fromEntries(roles.map(role => [role, candidateModel]))); setError(''); setSaved(false); }
  function save() {
    const missing = roles.filter(role => { const model = models[role]?.trim(); return !model || model === candidateModel; });
    if (missing.length) { setError(`请填写实际 Model ID：${missing.join('、')}`); setSaved(false); return; }
    try { sessionStorage.setItem('jx10_ai_config', JSON.stringify({ version: 1, mode: 'multi', roles: Object.fromEntries(roles.map(role => [role, { model: models[role] }])) })); setError(''); setSaved(true); } catch { setError('当前浏览器无法保存会话配置。'); setSaved(false); }
  }
  return <section className="page"><span className="eyebrow">配置 / BYOK</span><h2>青鱼推荐配置</h2><p>五岗位已恢复为独立 Model ID 配置。当前只保存候选值和实际 ID，不保存 API Key；参数、连接测试与调用记录仍未迁移。</p><div className="card"><strong>青鱼推荐配置</strong><p>候选值只用于填写提示，保存前必须替换为服务商实际 Model ID。</p><button className="secondary" onClick={applyCandidate}>填入候选值</button></div><div className="roles">{roles.map(role => <label key={role} className="role-field"><span>{role} Model ID</span><input value={models[role] || ''} onChange={event => setModel(role, event.target.value)} placeholder="例如：provider/model-id" /></label>)}</div>{error && <p className="error" role="alert">{error}</p>}<button className="primary" onClick={save}>保存当前会话配置</button>{saved && <p className="success" role="status">已保存到当前浏览器会话，未写入存档。</p>}</section>;
}

function App() {
  const [saves, setSaves] = useState<LocalSave[]>(readSaves);
  const [notice, setNotice] = useState('');
  const [legacyText, setLegacyText] = useState<string | null>(null);
  const [indexedDbReady, setIndexedDbReady] = useState(true);
  useEffect(() => {
    let active = true;
    void hydrateSaves().then(result => {
      if (!active) return;
      setSaves(result.saves); setIndexedDbReady(result.indexedDb);
      if (!result.saves.length) setLegacyText(readLegacyLibraryText());
      if (!result.indexedDb) setNotice('IndexedDB 不可用，当前仅使用本地回退存储；原存档不会被删除。');
    });
    const refresh = () => setSaves(readSaves());
    addEventListener('popstate', refresh);
    return () => { active = false; removeEventListener('popstate', refresh); };
  }, []);
  function migrateLegacyLibrary() {
    if (!legacyText) return;
    downloadText(`九霄-旧localStorage原文备份-${Date.now()}.json`, legacyText, 'application/json;charset=utf-8');
    try {
      const migrated = migrateLegacyLibraryText(legacyText);
      if (!migrated.length || !writeSaves([...migrated, ...readSaves()])) throw new Error('migration');
      setSaves(readSaves()); setLegacyText(null); setNotice(`已迁移 ${migrated.length} 份旧局。原 localStorage 文本已备份，旧键仍保留。`);
    } catch { setNotice('旧 localStorage 存档无法通过校验，未写入新存储。原键和备份均保留。'); }
  }
  function importFile(file: File) {
    if (file.size > MAX_IMPORT_BYTES) { setNotice('导入失败：文件超过 32 MiB 上限，原存档未修改。'); return; }
    file.text().then(text => {
      downloadText(`九霄-导入前原文备份-${Date.now()}.txt`, text, 'text/plain;charset=utf-8');
      try {
        const save = parseLegacySave(file, text);
        if (!writeSaves([save, ...readSaves().filter(item => item.saveId !== save.saveId)])) throw new Error('storage');
        setSaves(readSaves()); setNotice(`已导入「${save.name}」。原文备份已下载，当前局仍处于待规则状态。`); go(`/game/${save.saveId}`);
      } catch { setNotice('导入失败：文件格式或内容不符合旧档契约。原文件和已有存档未修改。'); }
    }).catch(() => setNotice('导入失败：无法读取文件。原存档未修改。'));
  }
  function exportFile(save = saves[0]) { if (!save) { setNotice('暂无可导出的存档。'); return; } downloadText(`九霄-${save.name}.json`, JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save }, null, 2), 'application/json;charset=utf-8'); setNotice('存档已导出。'); }
  const currentRoute = route();
  const game = currentRoute.startsWith('/game/') ? saves.find(save => save.saveId === currentRoute.split('/')[2]) : undefined;
  const page = currentRoute === '/new' ? <NewCharacter onSaved={save => { setSaves(readSaves()); go(`/game/${save.saveId}`); }} /> : currentRoute === '/world' ? <World /> : currentRoute === '/settings/ai' ? <AiSettings /> : currentRoute.startsWith('/game/') ? <Game save={game} onExport={exportFile} /> : <Home saves={saves} />;
  const migrationAction = legacyText ? <button className="notice-action" onClick={migrateLegacyLibrary}>下载原文备份并迁移</button> : undefined;
  const storageNotice = indexedDbReady ? notice : `${notice} IndexedDB 回退模式。`;
  return <Shell saves={saves} notice={legacyText ? '检测到旧版 localStorage 存档。请先备份原文，再开始迁移。' : storageNotice} noticeAction={migrationAction} onImport={importFile} onExport={() => exportFile()}>{page}</Shell>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(<App />);
