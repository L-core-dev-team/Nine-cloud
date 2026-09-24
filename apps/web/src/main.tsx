import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';
import { AiSettings } from './ai-settings';
import { MountainGateScene } from './scene';
import { MAX_IMPORT_BYTES, migrateLegacyLibraryText, parseLegacySave } from './legacy';
import { clearDraft, createSaveId, hydrateSaves, readDraft, readLegacyLibraryText, readSaves, writeDraft, writeSaves, type LocalSave } from './storage';
import './style.css';

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

function downloadFileCopy(file: File, name: string): void {
  const url = URL.createObjectURL(file.slice(0, file.size, file.type || 'application/octet-stream'));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Theme = 'night' | 'day';

function Shell({ children, saves, notice, noticeAction, theme, onThemeChange, onImport, onExport }: { children: ReactNode; saves: LocalSave[]; notice: string; noticeAction?: ReactNode; theme: Theme; onThemeChange: () => void; onImport: (file: File) => void; onExport: () => void }) {
  const [menu, setMenu] = useState(false);
  const themeLabel = theme === 'night' ? '夜色' : '晴昼';
  const nextThemeLabel = theme === 'night' ? '晴昼' : '夜色';
  const themeAction = () => { onThemeChange(); setMenu(false); };
  const isLanding = route() === '/';
  const showNavigation = !isLanding;
  return <div className={isLanding ? 'jx-shell landing-shell' : 'jx-shell'}><header><button className="brand" onClick={() => go('/')}>踏月过山门，天地任君行。</button>{showNavigation && <nav><button onClick={() => go('/lobby')}>山门</button><button onClick={() => go('/world')}>世界设定</button><button onClick={() => go('/settings/ai')}>AI 设置</button></nav>}<button className="theme-toggle" aria-label={`切换到${nextThemeLabel}配色`} onClick={onThemeChange}>{themeLabel}</button><button className="menu" aria-expanded={menu} onClick={() => setMenu(open => !open)}>菜单</button></header>{menu && <aside><strong>{saves.length ? `${saves.length} 份本地存档` : '暂无存档'}</strong>{showNavigation && <><button onClick={() => { setMenu(false); go('/lobby'); }}>回到山门</button><button onClick={() => { setMenu(false); go('/new'); }}>新开一局</button></>}<button onClick={() => { setMenu(false); onExport(); }}>导出存档</button><button onClick={themeAction}>切换到{nextThemeLabel}配色</button><label>导入旧档 / JSON<input type="file" accept=".json,.txt,.html,.htm" onChange={event => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /></label></aside>}{notice && <p className="notice" role="status">{notice} {noticeAction}</p>}<main>{children}</main><footer><span>本地优先 · API 密钥不写入存档</span><span>契约 v{SAVE_SCHEMA_VERSION}</span></footer></div>;
}

function Landing() {
  return <section className="hero"><div className="landing-copy"><span className="eyebrow">月下山门</span><h1 className="hero-mark">九霄</h1><p className="hero-deck">修途自此启程。</p><button className="portal-enter" onClick={() => go('/lobby')}><span>进入世界</span></button></div><MountainGateScene /></section>;
}

function WorldHub({ saves }: { saves: LocalSave[] }) {
  const save = saves[0];
  return <>
    <section className="page lobby-page">
      <span className="eyebrow">山门之内</span>
      <h2>选择去处</h2>
      <p>旧档可接着走；另开新局，将从角色创建开始。</p>
      <div className="lobby-actions">
        {save && <button className="primary" onClick={() => go(`/game/${save.saveId}`)}>继续游玩<span>{save.name} · 第 {save.revision} 回合</span></button>}
        <button className="primary" onClick={() => go('/new')}>新开一局<span>进入角色创建，择定出身与地域</span></button>
        <button className="secondary" onClick={() => go('/world')}>阅读世界设定<span>查阅已审核的世界资料</span></button>
        <button className="secondary" onClick={() => go('/settings/ai')}>AI 设置<span>配置五个岗位与连接信息</span></button>
      </div>
    </section>
    {saves.length > 1 && <section className="home-saves">
      <h2>其他行囊 <small>{saves.length - 1} 份本地存档</small></h2>
      <div className="home-save-grid">
        {saves.slice(save ? 1 : 0).map(item => <button className="home-save" key={item.saveId} onClick={() => go(`/game/${item.saveId}`)}>
          <strong>{item.name}</strong>
          <span>第 {item.revision} 回合 · {item.location}</span>
        </button>)}
      </div>
    </section>}
  </>;
}

function NewCharacter({ onSaved }: { onSaved: (save: LocalSave) => void }) {
  const [form, setForm] = useState<Record<string, string>>(readDraft);
  const [error, setError] = useState('');
  useEffect(() => { if (!writeDraft(form)) setError('浏览器暂时无法保存草稿。提交前请保持页面打开。'); }, [form]);
  const set = (key: string, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  function submit(mode: 'manual' | 'random' = 'manual') {
    const talents = (form.talents || '').split('\n').map(value => value.trim()).filter(Boolean);
    if (talents.length > 3) { setError('天赋最多三项，请每行填写一项。'); return; }
    const now = new Date().toISOString();
    const name = form.name?.trim() || '无名修士';
    const save: LocalSave = { schemaVersion: 1, saveId: createSaveId(), name, createdAt: now, updatedAt: now, revision: 0, canonVersion: 'pending-author-review', ruleVersion: 'rules-not-signed', memoryPolicyVersion: 'none', character: { ...form, name, talents }, location: form.region || '中州天枢域', status: 'pending_rules', messages: [], pending: { id: createSaveId(), text: mode === 'random' ? '按已录入资料随机创建普通角色并开始第一幕，不随机赠送未设定的天赋。' : `按此角色进入第一幕：${JSON.stringify({ ...form, name, talents })}`, gm: false, source: mode === 'random' ? 'RANDOM_START' : 'CHARACTER_START' } };
    if (!writeSaves([save, ...readSaves()])) { setError('浏览器存储空间不足，角色尚未创建。请先导出或清理旧存档。'); return; }
    clearDraft(); onSaved(save);
  }
  return <section className="page"><span className="eyebrow">第一步 / 建角</span><h2>把自己写进山门。</h2><p>先保存角色资料，再进入剧情。规则尚未签署时，开局请求会留作待处理，不会伪装成已生成剧情。</p><div className="form">{fields.map(([key, label, hint]) => <label key={key}>{label}<small>{hint}</small>{key === 'region' ? <select value={form[key] || '中州天枢域'} onChange={event => set(key, event.target.value)}><option>中州天枢域</option><option>北境霜寒域</option><option>南疆万蛊域</option><option>东瀚龙吟域</option><option>西荒梵天域</option><option>完全自定义</option></select> : key === 'talents' || key === 'goal' ? <textarea value={form[key] || ''} onChange={event => set(key, event.target.value)} /> : <input value={form[key] || ''} onChange={event => set(key, event.target.value)} />}</label>)}</div>{error && <p className="error" role="alert">{error}</p>}<div className="actions"><button className="secondary" onClick={() => go('/')}>返回首页</button><button className="secondary" onClick={() => submit('random')}>按资料随机开局<span>保留随机开局意图，等待 S3 规则与 AI</span></button><button className="primary" onClick={() => submit('manual')}>保存角色并进入<span>本地存档 · 待剧情规则接入</span></button></div></section>;
}

function World() { return <section className="page"><span className="eyebrow">只读资料 / Canon</span><h2>世界设定</h2><p>世界设定独立于游戏流程。当前仓库只有待作者逐图审核的 OCR 资料，不把未审文字伪装成正式 Canon。</p><div className="card"><strong>公开 Canon 尚未发布</strong><p>待作者 A 提供原图并完成逐条裁定后，世界书才会进入玩家端。</p><button className="secondary" onClick={() => go('/')}>回到首页</button></div></section>; }

function LegacyArchive({ save }: { save: LocalSave }) {
  const archive = save.legacyArchive;
  if (!archive) return null;
  const keys = ['player', 'world', 'npcs', 'items', 'events', 'stm', 'ltm', 'facts', 'actions', 'legacy', 'supplements', 'pending', 'status', 'intel', 'memory'];
  return <section className="card legacy-archive"><h3>旧档内容与迁移核对</h3><p>原始字段保存在这份存档的历史资料区，不作为新规则结算结果。展开可逐项核对。</p><div className="legacy-groups">{keys.filter(key => Object.prototype.hasOwnProperty.call(archive.payload, key)).map(key => <details key={key}><summary>{key} <small>{Array.isArray(archive.payload[key]) ? `${(archive.payload[key] as unknown[]).length} 项` : '已保留'}</small></summary><pre>{JSON.stringify(archive.payload[key], null, 2)}</pre></details>)}</div></section>;
}

function Game({ save, onExport, onImportSupplement }: { save: LocalSave | undefined; onExport: (save?: LocalSave) => void; onImportSupplement: (file: File, save: LocalSave) => void }) {
  if (!save) return <section className="page"><h2>找不到这份存档</h2><p>它可能已被删除，或链接来自另一个浏览器。</p><button className="primary" onClick={() => go('/')}>回到首页</button></section>;
  const pending = save.pending ?? save.legacyArchive?.payload.pending;
  const pendingFromLegacy = save.pending === undefined && pending !== undefined && pending !== null;
  return <section className="page"><span className="eyebrow">第 {save.revision} 回合 · {save.location}</span><h2>{save.name}</h2><p>角色资料已保存。当前回合等待 S3 规则契约接入，尚未结算任何世界事实。</p><div className="stats"><div><small>角色</small><strong>{save.name}</strong></div><div><small>地域</small><strong>{save.location}</strong></div><div><small>状态</small><strong>{pending ? (pendingFromLegacy ? '旧档行动待恢复' : '开局请求待处理') : '待规则接入'}</strong></div></div><div className="actions"><button className="secondary" onClick={() => go('/world')}>阅读世界设定</button><button className="secondary" onClick={() => onExport(save)}>导出此档</button><label className="secondary file-action">导入补充 TXT<input type="file" accept=".txt,.md" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) onImportSupplement(file, save); event.currentTarget.value = ''; }} /></label></div>{Boolean(pending) && <section className="card"><strong>{pendingFromLegacy ? '旧档待处理行动已保留' : '开局请求已保存为待处理'}</strong><p>当前阶段不会自动重试或结算这条行动。请保留原档，等待 S3 的幂等规则接入。</p><pre>{JSON.stringify(pending, null, 2)}</pre></section>}<LegacyArchive save={save} /></section>;
}

function App() {
  const [saves, setSaves] = useState<LocalSave[]>(readSaves);
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('jx10_appearance') === 'day' ? 'day' : 'night'; }
    catch { return 'night'; }
  });
  const [notice, setNotice] = useState('');
  const [legacyText, setLegacyText] = useState<string | null>(null);
  const [indexedDbReady, setIndexedDbReady] = useState(true);
  const [importPreview, setImportPreview] = useState<{ save: LocalSave; sourceName: string } | null>(null);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('jx10_appearance', theme); } catch { /* Appearance remains available for this session. */ }
  }, [theme]);
  useEffect(() => {
    let active = true;
    void hydrateSaves().then(result => {
      if (!active) return;
      setSaves(result.saves); setIndexedDbReady(result.indexedDb);
      if (!result.saves.length) setLegacyText(readLegacyLibraryText());
      if (!result.indexedDb) setNotice('IndexedDB 不可用，当前仅使用本地回退存储；原存档不会被删除。');
    });
    const refresh = () => setSaves(readSaves());
    const externalSaveChange = (event: StorageEvent) => {
      if (event.key !== 'jiuxiao_1_local_saves') return;
      setSaves(readSaves());
      setNotice('检测到另一个标签页修改了本地存档列表，已刷新当前副本。继续操作前请重新核对，避免覆盖较新的内容。');
    };
    addEventListener('popstate', refresh);
    addEventListener('storage', externalSaveChange);
    return () => { active = false; removeEventListener('popstate', refresh); removeEventListener('storage', externalSaveChange); };
  }, []);
  function migrateLegacyLibrary() {
    if (!legacyText) return;
    downloadText(`九霄-旧localStorage原文备份-${Date.now()}.json`, legacyText, 'application/json;charset=utf-8');
    try {
      const migrated = migrateLegacyLibraryText(legacyText);
      const current = readSaves(); const ids = new Set(current.map(save => save.saveId)); let copied = 0;
      const safeMigrated = migrated.map(save => {
        if (!ids.has(save.saveId)) { ids.add(save.saveId); return save; }
        copied += 1; const copy = { ...save, saveId: createSaveId(), name: `${save.name}（迁移副本）` }; ids.add(copy.saveId); return copy;
      });
      if (!safeMigrated.length || !writeSaves([...safeMigrated, ...current])) throw new Error('migration');
      setSaves(readSaves()); setLegacyText(null); setNotice(`已迁移 ${safeMigrated.length} 份旧局。${copied ? `${copied} 份 ID 冲突已另存副本。` : ''}原 localStorage 文本已备份，旧键仍保留。`);
    } catch { setNotice('旧 localStorage 存档无法通过校验，未写入新存储。原键和备份均保留。'); }
  }
  function importFile(file: File) {
    if (file.size > MAX_IMPORT_BYTES) { setNotice('导入失败：文件超过 32 MiB 上限，原存档未修改。'); return; }
    file.text().then(text => {
      downloadFileCopy(file, `九霄-导入前原文备份-${Date.now()}-${file.name}`);
      try {
        const save = parseLegacySave(file, text);
        setImportPreview({ save, sourceName: file.name }); setNotice(`已读取「${file.name}」。原始文件副本已下载；核对字段后再选择导入。`);
      } catch { setNotice('导入失败：文件格式或内容不符合旧档契约。原文件和已有存档未修改。'); }
    }).catch(() => setNotice('导入失败：无法读取文件。原存档未修改。'));
  }
  function commitImport(strategy: 'keep' | 'replace' | 'copy') {
    if (!importPreview) return;
    const current = readSaves();
    const collision = current.some(item => item.saveId === importPreview.save.saveId);
    if (collision && strategy === 'keep') { setNotice('此档 ID 已存在。请选择“替换现有存档”或“另存副本”。'); return; }
    const candidate = strategy === 'copy' ? { ...importPreview.save, saveId: createSaveId(), name: `${importPreview.save.name}（副本）`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : importPreview.save;
    const next = collision && strategy === 'replace' ? current.map(item => item.saveId === candidate.saveId ? candidate : item) : [candidate, ...current];
    if (!writeSaves(next)) { setNotice('浏览器存储失败，存档尚未导入。已下载的原始备份仍可使用。'); return; }
    setSaves(readSaves()); setImportPreview(null); setNotice(`已导入「${candidate.name}」。原始旧档字段保存在历史资料区。`); go(`/game/${candidate.saveId}`);
  }
  function exportFile(save = saves[0]) { if (!save) { setNotice('暂无可导出的存档。'); return; } downloadText(`九霄-${save.name}.json`, JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save }, null, 2), 'application/json;charset=utf-8'); setNotice('存档已导出。'); }
  function importSupplement(file: File, save: LocalSave) {
    if (file.size > 100_000) { setNotice('补充资料需小于 100 KB，当前存档未修改。'); return; }
    void file.text().then(text => {
      const current = readSaves();
      const target = current.find(item => item.saveId === save.saveId);
      if (!target) { setNotice('找不到目标存档，补充资料未写入。'); return; }
      const payload = target.legacyArchive?.payload || {};
      const existing = Array.isArray(payload.supplements) ? payload.supplements : [];
      const next: LocalSave = { ...target, updatedAt: new Date().toISOString(), legacyArchive: { sourceFormat: target.legacyArchive?.sourceFormat || 'JIUXIAO_LOCAL', sourceVersion: target.legacyArchive?.sourceVersion ?? null, payload: { ...payload, supplements: [...existing, { name: file.name, text, source: 'USER_SUPPLIED' }] } } };
      if (!writeSaves(current.map(item => item.saveId === save.saveId ? next : item))) { setNotice('浏览器存储失败，补充资料没有写入。'); return; }
      setSaves(readSaves()); setNotice(`「${file.name}」已附加到「${save.name}」，不会覆盖旧内容。`);
    }).catch(() => setNotice('无法读取该补充资料，存档未修改。'));
  }
  const currentRoute = route();
  const game = currentRoute.startsWith('/game/') ? saves.find(save => save.saveId === currentRoute.split('/')[2]) : undefined;
  const page = currentRoute === '/new' ? <NewCharacter onSaved={save => { setSaves(readSaves()); go(`/game/${save.saveId}`); }} /> : currentRoute === '/world' ? <World /> : currentRoute === '/settings/ai' ? <AiSettings /> : currentRoute === '/lobby' ? <WorldHub saves={saves} /> : currentRoute.startsWith('/game/') ? <Game save={game} onExport={exportFile} onImportSupplement={importSupplement} /> : <Landing />;
  const migrationAction = legacyText ? <button className="notice-action" onClick={migrateLegacyLibrary}>下载原文备份并迁移</button> : undefined;
  const storageNotice = indexedDbReady ? notice : `${notice} IndexedDB 回退模式。`;
  return <Shell saves={saves} theme={theme} onThemeChange={() => setTheme(current => current === 'night' ? 'day' : 'night')} notice={legacyText ? '检测到旧版 localStorage 存档。请先备份原文，再开始迁移。' : storageNotice} noticeAction={migrationAction} onImport={importFile} onExport={() => exportFile()}>{importPreview && <section className="import-preview card" role="dialog" aria-labelledby="import-preview-title"><span className="eyebrow">旧档导入 / 提交前核对</span><h2 id="import-preview-title">{importPreview.save.name}</h2><p>来源：{importPreview.sourceName}。原始文件已先下载为备份。核对数量与回合，再选择导入方式；所有顶层字段均会原样保存在该存档的历史资料区。</p><div className="stats"><div><small>回合</small><strong>{importPreview.save.revision}</strong></div><div><small>消息</small><strong>{importPreview.save.messages.length}</strong></div><div><small>人物 / 物品</small><strong>{Array.isArray(importPreview.save.legacyArchive?.payload.npcs) ? importPreview.save.legacyArchive.payload.npcs.length : 0} / {Array.isArray(importPreview.save.legacyArchive?.payload.items) ? importPreview.save.legacyArchive.payload.items.length : 0}</strong></div></div><div className="legacy-groups">{Object.entries(importPreview.save.legacyArchive?.payload || {}).map(([key, value]) => <div className="import-field" key={key}><strong>{key}</strong><span>{Array.isArray(value) ? `${value.length} 项` : value !== null && typeof value === 'object' ? `${Object.keys(value).length} 个字段` : typeof value === 'string' ? `${value.length} 字符` : '已保留'}</span></div>)}</div><div className="actions"><button className="primary" onClick={() => commitImport('keep')}>导入此档</button>{saves.some(item => item.saveId === importPreview.save.saveId) && <><button className="secondary" onClick={() => commitImport('copy')}>另存为副本</button><button className="secondary" onClick={() => commitImport('replace')}>替换现有存档</button></>}<button className="secondary" onClick={() => { setImportPreview(null); setNotice('已取消导入。原存档未修改，原始备份仍保留。'); }}>取消</button></div></section>}{page}</Shell>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(<App />);
