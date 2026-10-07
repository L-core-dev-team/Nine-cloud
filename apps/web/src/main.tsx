import {claimCharacterDraftId} from './idb';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';
import { SCENE_MANIFEST, sceneForLocation, type SceneId } from '@jiuxiao/content/scenes';
import type { CanonRuntimeEntry } from '@jiuxiao/content/worldbook';
import { AiSettings } from './ai-settings';
import { ReadableData } from './components/ReadableData';
import { CHARACTER_OPTIONS } from './character-options';
import { CloudSettings } from './routes/CloudSettings';
import { TurnWorkspace } from './routes/TurnWorkspace';
import { INTERNAL_TURN_WORKSPACE_ENABLED } from './internal-turn-workspace';
import { MountainGateScene } from './scene';
import { startSyntheticWaterAmbience, type AmbientAudioHandle } from './ambient-audio';
import { DEFAULT_GRAPHICS_SETTINGS, loadGraphicsSettings, saveGraphicsSettings, type GraphicsSettings } from './graphics-settings';
import { GraphicsSettingsPage } from './routes/GraphicsSettings';
import { CANDIDATE_ILLUSTRATIONS, type CandidateIllustration, type CandidateIllustrationCollection } from './candidate-atlas';
import { SceneAtmosphere, type SceneRenderStatus } from './scenes/SceneAtmosphere';
import { MAX_IMPORT_BYTES, migrateLegacyLibraryText, parseLegacySave } from './legacy';
import { serializeJsonWithCredentialRedaction, serializeSaveForExport } from './export-save';
import { clearDraft, commitSaves, createIdempotencyKey, createSaveId, hydrateSaves, readActionDraft, readDraft, readLegacyLibraryText, readSaves, writeActionDraft, writeDraft, type LocalSave } from './storage';
import type { SaveCommitResult } from './idb';
import { mediaUrlForBrowser } from './media-compat';
import './style.css';

const fields = [
  ['name', '姓名', '可留空，由你在提交前确认'], ['age', '年龄', '例如：18 或未知'],
  ['personality', '性格', '例如：冷静谨慎'], ['origin', '身份', '例如：散修'],
  ['realm', '修为', '例如：炼气期'], ['root', '灵根', '例如：天灵根（金）'],
  ['appearance', '外貌', '简短描述即可'], ['talents', '天赋 / 特殊设定', '每行一项，最多三项'],
  ['goal', '补充目标', '例如：只想炼器'], ['region', '开局地域', '中州天枢域'],
] as const;
const REGION_VISUAL_IDS: Record<string, string> = {
  '中州天枢域': 'region_zhongzhou_tianshu',
  '东瀚龙吟域': 'region_donghan_longyin',
  '西荒焚天域': 'region_xihuang_fentian',
  '北境霜寒域': 'region_beijing_shuanghan',
  '南疆万蛊域': 'region_nanjiang_wangu',
  '完全自定义': 'world_jiuxiao',
};
const CANON_CATEGORY_LABELS: Record<string, string> = {
  world_overview: '世界', region: '地域', faction: '势力', system: '体系',
  cultivation: '修炼', economy: '经济', resources: '资源',
};

function canonCategoryLabel(category: string): string {
  return CANON_CATEGORY_LABELS[category] ?? '设定';
}

const route = () => window.location.pathname.replace(/\/+$/, '') || '/';
const go = (path: string) => {
  const destination = path === '/turns' && !INTERNAL_TURN_WORKSPACE_ENABLED ? '/lobby' : path;
  if (destination.startsWith('/game/')) {
    try { sessionStorage.setItem('jiuxiao_active_save_id', decodeURIComponent(destination.slice('/game/'.length))); } catch { /* Route navigation does not depend on this preference. */ }
  }
  const sourceRoute = route();
  const returnTo = sourceRoute;
  history.pushState(destination === '/world' || destination === '/settings/ai' ? { returnTo } : {}, '', destination);
  // Forward navigation starts at the top; returning via history.back() keeps
  // the browser's native per-entry scroll restoration for the reader flow.
  window.scrollTo(0, 0);
  dispatchEvent(new PopStateEvent('popstate'));
  if (sourceRoute !== '/settings/ai' && destination !== '/settings/ai' && !destination.startsWith('/game/')) {
    requestAnimationFrame(() => { if (route() === destination) window.scrollTo(0, 0); });
  }
};
const returnFromReading = () => {
  const candidate = history.state?.returnTo;
  const safeReturnRoutes = new Set(['/','/lobby','/new','/intro','/saves','/settings/ai','/settings/graphics','/settings/cloud','/world']);
  const hasSafeReturn = typeof candidate === 'string' && (safeReturnRoutes.has(candidate) || /^\/game\/[^/]+$/.test(candidate));
  if (hasSafeReturn) {
    // The destination already exists immediately behind this reader in the
    // browser history. Going back preserves its original return target when
    // readers/settings are opened in sequence (for example world -> AI).
    history.back();
    return;
  }
  go('/lobby');
};

function commitSuccessMessage(result: SaveCommitResult, message: string): string {
  if (result.ok && result.warning === 'compatibility-mirror-unavailable') {
    return `${message} 本次变更已写入浏览器数据库；兼容副本未能完整同步。重新载入时系统会尝试恢复副本。离开前请核对存档列表，并导出仍需保留的存档。`;
  }
  return message;
}

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

function Shell({ children, saves, notice, noticeAction, theme, onThemeChange, onImport, onExport, sceneId, graphicsSettings, ambientAudioActive, onToggleAmbientAudio }: { children: ReactNode; saves: LocalSave[]; notice: string; noticeAction?: ReactNode; theme: Theme; onThemeChange: () => void; onImport: (file: File) => void; onExport: () => void; sceneId: SceneId; graphicsSettings: GraphicsSettings; ambientAudioActive: boolean; onToggleAmbientAudio: () => void }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menu]);
  const themeLabel = theme === 'night' ? '夜色' : '晴昼';
  const nextThemeLabel = theme === 'night' ? '晴昼' : '夜色';
  const themeAction = () => { onThemeChange(); setMenu(false); };
  const isLanding = route() === '/';
  const showSkipLink = route() !== '/settings/ai';
  const showNavigation = !isLanding;
  const scene = SCENE_MANIFEST.find(candidate => candidate.id === sceneId);
  const desktopPoster = scene?.desktopPoster ?? '/scenes/gate-moonlight.webp';
  const mobilePoster = scene?.mobilePoster ?? '/scenes/gate-moonlight-mobile.webp';
  const gatePoster = '/scenes/gate-moonlight.webp';
  const paperTexture = theme === 'day' ? '/scenes/candidate/atlas/texture_day-paper.webp' : '/scenes/candidate/atlas/texture_night-ink.webp';
  const backgroundStyle = {
    '--jx-scene-poster-desktop': `url("${mediaUrlForBrowser(desktopPoster)}")`,
    '--jx-scene-poster-mobile': `url("${mediaUrlForBrowser(mobilePoster)}")`,
    '--jx-gate-poster': `url("${mediaUrlForBrowser(gatePoster)}")`,
    '--jx-paper-texture': `url("${mediaUrlForBrowser(paperTexture)}")`,
  } as CSSProperties;
  return <div className={isLanding ? 'jx-shell landing-shell' : 'jx-shell'} style={backgroundStyle}>{showSkipLink && <a className="skip-to-content" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>跳到主要内容</a>}<SceneAtmosphere sceneId={sceneId} theme={theme} settings={graphicsSettings} /><header><button className="brand" onClick={() => go('/')}>踏月过山门，天地任君行。</button>{showNavigation && <nav><button onClick={() => go('/lobby')}>山门</button><button onClick={() => go('/world')}>世界设定</button><button onClick={() => go('/settings/ai')}>AI 设置</button><button onClick={() => go('/settings/graphics')}>画面与声音</button><button onClick={() => go('/settings/cloud')}>账号与云档</button></nav>}<div className="header-tools"><button className={`ambient-toggle${ambientAudioActive ? ' is-active' : ''}`} aria-pressed={ambientAudioActive} onClick={onToggleAmbientAudio}>{ambientAudioActive ? '水声已启' : '启水声'}</button><button className="theme-toggle" aria-label={`切换到${nextThemeLabel}配色`} onClick={onThemeChange}>{themeLabel}</button><button className="menu" aria-expanded={menu} onClick={() => setMenu(open => !open)}>菜单</button></div></header>{menu && <div className="menu-overlay" aria-hidden="true" onClick={() => setMenu(false)} />}{menu && <aside><strong>{saves.length ? `${saves.length} 份本地存档` : '暂无存档'}</strong>{showNavigation && <><button onClick={() => { setMenu(false); go('/lobby'); }}>回到山门</button><button onClick={() => { setMenu(false); go('/new'); }}>新开一局</button><button onClick={() => { setMenu(false); go('/world'); }}>阅读世界设定</button><button onClick={() => { setMenu(false); go('/settings/ai'); }}>AI 设置</button><button onClick={() => { setMenu(false); go('/settings/graphics'); }}>画面与声音</button><button onClick={() => { setMenu(false); go('/settings/cloud'); }}>账号与云档</button></>}<button onClick={() => { setMenu(false); onExport(); }}>导出存档</button><button onClick={themeAction}>切换到{nextThemeLabel}配色</button><label>导入旧档 / JSON<input type="file" accept=".json,.txt,.html,.htm" onChange={event => { const file = event.target.files?.[0]; if (file) { setMenu(false); onImport(file); } event.currentTarget.value = ''; }} /></label></aside>}{notice && <p className="notice" role="status">{notice} {noticeAction}</p>}<main id={showSkipLink ? "main-content" : undefined} tabIndex={showSkipLink ? -1 : undefined}>{children}</main><footer><span>本地优先 · API 密钥不写入存档</span><span>契约 v{SAVE_SCHEMA_VERSION}</span><nav className="footer-legal" aria-label="法律与反馈"><a href="/privacy">隐私政策</a><a href="/privacy-rights">隐私权利</a><a href="/terms">用户协议</a><a href="/feedback">问题反馈</a></nav></footer></div>;}

function Landing() {
  return <section className="hero"><div className="landing-copy"><span className="eyebrow">月下山门</span><h1 className="hero-mark">九霄</h1><p className="hero-deck">修途自此启程。</p><button className="portal-enter" onClick={() => go('/lobby')}><span>进入世界</span></button></div><MountainGateScene /></section>;
}

function WorldHub({ saves }: { saves: LocalSave[] }) {
  let activeSaveId = '';
  try { activeSaveId = sessionStorage.getItem('jiuxiao_active_save_id') || ''; } catch { /* Use the first available save. */ }
  const save = saves.find(item => item.saveId === activeSaveId) || saves[0];
  return <>
    <section className="page lobby-page">
      <span className="eyebrow">山门之内</span>
      <h2>选择去处</h2>
      <p>旧档可接着走；另开新局，将从角色创建开始。</p>
      <div className="lobby-actions">
        {save && <button className="primary" onClick={() => go(`/game/${save.saveId}`)}>继续游玩<span>{save.name} · 存档版本 {save.revision}</span></button>}
        <button className="primary" onClick={() => go('/new')}>新开一局<span>进入角色创建，择定出身与地域</span></button>
        <button className="secondary" onClick={() => go('/intro')}>作品简介<span>先读一段九霄的天地与玩法</span></button>
        <button className="secondary" onClick={() => go('/world')}>阅读世界设定<span>查阅已审核的世界资料</span></button>
        <button className="secondary" onClick={() => go('/settings/ai')}>AI 设置<span>配置五个岗位与连接信息</span></button>
        {saves.length > 0 && <button className="secondary" onClick={() => go('/saves')}>管理存档<span>改名、导出或删除本地档案</span></button>}
        <button className="quiet-action" onClick={() => save ? go(`/game/${save.saveId}`) : go('/new')}>跳过设置<span>{save ? '不调整 AI，直接回到最近存档' : '不配置 AI，先创建角色'}</span></button>
      </div>
    </section>
    {saves.length > 1 && <section className="home-saves">
      <h2>其他行囊 <small>{saves.length - 1} 份本地存档</small></h2>
      <div className="home-save-grid">
        {saves.filter(item => item.saveId !== save?.saveId).map(item => <button className="home-save" key={item.saveId} onClick={() => go(`/game/${item.saveId}`)}>
          <strong>{item.name}</strong>
          <span>第 {item.revision} 回合 · {item.location}</span>
        </button>)}
      </div>
    </section>}
  </>;
}

function SaveManager({ saves, onRename, onDelete, onExport }: {
  saves: LocalSave[];
  onRename: (save: LocalSave, name: string) => Promise<boolean>;
  onDelete: (save: LocalSave) => Promise<boolean>;
  onExport: (save: LocalSave) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const reviewedSaveRef = useRef<LocalSave | null>(null);
  async function removeReviewedSave(save: LocalSave) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const ok = await onDelete(reviewedSaveRef.current || save);
      if (ok) { setDeletingId(null); setFeedback('本地存档已删除。'); }
      else setFeedback('删除未完成。请检查另一标签页的改动后重试。');
    } catch { setFeedback('删除未完成。存档状态未确认，请重新载入列表后核对。'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <section className="page save-manager"><span className="eyebrow">本地档案</span><h2>存档管理</h2>
    <p>改名只调整列表称呼。删除前请导出副本；其他标签页若改过同一存档，删除会被拒绝。</p>
    {!saves.length && <p>目前没有本地存档。</p>}
    <div className="save-manager-list">{saves.map(save => <article className="card" key={save.saveId}>
      <div><h3>{save.name}</h3><p>{save.location} · 存档版本 {save.revision}</p></div>
      <div className="actions"><button className="secondary" disabled={busy} onClick={() => go(`/game/${save.saveId}`)}>打开</button>
        <button className="secondary" disabled={busy} onClick={() => onExport(save)}>导出</button>
        <button className="secondary" disabled={busy} onClick={() => { reviewedSaveRef.current = save; setEditingId(save.saveId); setDeletingId(null); setName(save.name); setFeedback(''); }}>改名</button>
        <button className="quiet-action" disabled={busy} onClick={() => { reviewedSaveRef.current = save; setDeletingId(save.saveId); setEditingId(null); setConfirmation(''); setFeedback(''); }}>删除</button></div>
      {editingId === save.saveId && <form className="save-manager-form" onSubmit={event => {
        event.preventDefault(); if (busyRef.current) return; busyRef.current = true; setBusy(true);
        void onRename(reviewedSaveRef.current || save, name).then(ok => {
          if (ok) { setEditingId(null); setFeedback('存档名称已更新。'); }
          else setFeedback('改名未写入。请检查存储状态或重新载入列表。');
        }).catch(() => setFeedback('改名未完成。存档状态未确认，请重新载入列表后核对。')).finally(() => { busyRef.current = false; setBusy(false); });
      }}><label>新名称<input value={name} maxLength={40} onChange={event => setName(event.target.value)} disabled={busy} /></label>
        <button className="primary" type="submit" disabled={busy || !name.trim() || name.trim() === save.name}>{busy ? '正在保存…' : '保存名称'}</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => setEditingId(null)}>取消</button></form>}
      {deletingId === save.saveId && <div className="save-manager-form" role="group" aria-label={`确认删除${save.name}`}>
        <p>此操作会移除本机这份存档。请先导出，并输入完整名称确认。</p>
        <label>确认名称<input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
        <button className="primary" disabled={busy || confirmation !== save.name} onClick={() => void removeReviewedSave(save)}>{busy ? '正在删除…' : '确认删除'}</button>
        <button className="secondary" disabled={busy} onClick={() => setDeletingId(null)}>取消</button></div>}
    </article>)}</div>
    {feedback && <p role="status">{feedback}</p>}
    <button className="secondary" onClick={() => go('/lobby')}>返回山门</button>
  </section>;
}

function NewCharacter({ onSaved }: { onSaved: (save: LocalSave) => Promise<boolean> }) {
  const [form, setForm] = useState<Record<string, string>>(readDraft);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const draftIdentity=useRef<Promise<string>|null>(null);
  function acquireDraft(){return draftIdentity.current??=claimCharacterDraftId().catch(error=>{draftIdentity.current=null;throw error;});}
  useEffect(()=>{void acquireDraft().catch(()=>{});},[]);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (!writeDraft(form)) setError('浏览器暂时无法保存草稿。提交前请保持页面打开。'); }, [form]);
  const set = (key: string, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const stepKeys: readonly (readonly string[])[] = [
    ['name', 'age', 'personality', 'origin', 'appearance'],
    ['realm', 'root', 'talents'],
    ['goal', 'region'],
  ];
  const stepNames = ['其人', '其道', '起行'];
  const selectedRegion = form.region || '中州天枢域';
  const regionArtworkId = REGION_VISUAL_IDS[selectedRegion] ?? 'world_jiuxiao';
  const regionArtwork = CANDIDATE_ILLUSTRATIONS.find(item => item.id === regionArtworkId);
  async function submit(mode: 'manual' | 'random' = 'manual') {
    if (submittingRef.current) return;
    const talents = (form.talents || '').split('\n').map(value => value.trim()).filter(Boolean);
    if (talents.length > 3) { setError('天赋最多三项，请每行填写一项。'); return; }
    submittingRef.current = true; setSubmitting(true); setError('');
    try {
    const draftId=await acquireDraft();
    const now = new Date().toISOString();
    const name = form.name?.trim() || '无名修士';
    const save: LocalSave = { schemaVersion: 1, saveId: draftId, name, createdAt: now, updatedAt: now, revision: 0, canonVersion: 'pending-author-review', ruleVersion: 'rules-not-signed', memoryPolicyVersion: 'none', character: { ...form, name, talents }, location: form.region || '中州天枢域', status: 'pending_rules', messages: [], pending: { id: createSaveId(), text: mode === 'random' ? '按已录入资料生成随机角色并开始第一幕。当前尚无规则结算，因此此意图不会自行改变人物资料。' : '按已填写的角色设定，开始第一幕。', gm: false, source: mode === 'random' ? 'RANDOM_START' : 'CHARACTER_START' } };
    if (!await onSaved(save)) { setError('存档列表刚有变化，或浏览器存储不可用。角色草稿仍在；请刷新存档列表后再提交。'); return; }
    clearDraft();
    } catch { setError('建角提交未完成。角色草稿仍在，请确认本地存储可用后重试。'); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }
  return <section className="page character-creation"><span className="eyebrow">建角 · {stepNames[step]}</span><h2>把自己写进山门。</h2>
    <p>依次记下人物、修行与去处。提交前可以回看修改；开局意图在规则未就绪时留在存档中。</p>
    <ol className="character-steps" aria-label="建角进度">{stepNames.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <div className="form">{fields.filter(([key]) => stepKeys[step]?.includes(key)).map(([key, label, hint]) => <div className="character-field" key={key}><label>{label}<small>{hint}</small>{key === 'region' ? <><select aria-label="开局地域" value={selectedRegion} onChange={event => set(key, event.target.value)}><option>中州天枢域</option><option>北境霜寒域</option><option>南疆万蛊域</option><option>东瀚龙吟域</option><option>西荒焚天域</option><option>完全自定义</option></select>{regionArtwork && <figure className="region-visual-reference"><img src={mediaUrlForBrowser(regionArtwork.src)} alt="" loading="lazy" decoding="async" /><figcaption><strong>{selectedRegion}</strong><span>地域画影 · 只作辨识，设定以正文为准</span></figcaption></figure>}</> : key === 'talents' || key === 'goal' ? <textarea aria-label={label} value={form[key] || ''} onChange={event => set(key, event.target.value)} /> : <input aria-label={label} value={form[key] || ''} onChange={event => set(key, event.target.value)} />}</label>{CHARACTER_OPTIONS[key] && <label className="character-suggestions">{label}备选<select aria-label={`${label}备选`} value="" onChange={event => {
      const value = event.target.value;
      if (!value) return;
      if (key === 'talents') {
        const previous = (form[key] || '').split('\n').map(item => item.trim()).filter(Boolean);
        if (previous.includes(value)) return;
        if (previous.length >= 3) { setError('天赋最多三项，请先修改已有内容。'); return; }
        set(key, [...previous, value].join('\n'));
      } else set(key, value);
      setError('');
    }}><option value="">选择后仍可自由修改</option>{CHARACTER_OPTIONS[key]!.map(option => <option key={option} value={option}>{option}</option>)}</select></label>}</div>)}</div>
    <p className="quiet-note">备选文字只填写角色草稿；修为、灵根与天赋仍须经过开局规则确认，不直接授予能力。</p>
    {step === 2 && <section className="character-summary" aria-label="角色提交前摘要"><h3>回看行传</h3><dl>{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{form[key]?.trim() || (key === 'region' ? '中州天枢域' : key === 'name' ? '无名修士' : '未填写')}</dd></div>)}</dl></section>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button className="secondary" onClick={() => step ? setStep(step - 1) : go('/lobby')}>{step ? '上一步' : '返回山门'}</button>
      {step < 2 ? <button className="primary" onClick={() => { setError(''); setStep(step + 1); }}>下一步</button> : <>
        <button className="secondary" disabled={submitting} onClick={() => submit('random')}>按资料随机开局<span>保留随机开局意图</span></button>
        <button className="primary" disabled={submitting} onClick={() => submit('manual')}>保存角色并进入<span>本地存档 · 待剧情规则接入</span></button>
      </>}</div>
  </section>;
}

function Introduction({ onStart, onWorld }: { onStart: () => void; onWorld: () => void }) { return <section className="page intro-page"><span className="eyebrow">九霄 · 行旅札记</span><h2>作品简介</h2><div className="intro-prose"><p>《九霄》是一款以东方修仙世界为核心的开放式文字角色扮演游戏。你可以在九霄大陆自行选择出身、修行道路与目标：入宗问道、独行江湖、炼丹炼器，或在诸域之间留下自己的名字。</p><p>世界设定以作者审核的资料为准。旅途中的人物状态和世界事实由规则记录；AI 可以理解你写下的行动并叙述结果，却不能凭一段故事改写既成之事。</p></div><div className="actions"><button className="primary" onClick={onStart}>创建角色</button><button className="secondary" onClick={onWorld}>查看世界资料</button></div></section>; }
const atlasCollections: readonly { id: CandidateIllustrationCollection; label: string }[] = [
  { id: 'world', label: '山河与地域' },
  { id: 'faction', label: '宗门与势力' },
  { id: 'system', label: '修行图鉴' },
  { id: 'brand', label: '题字与纹章' },
  { id: 'texture', label: '纸墨氛围' },
  { id: 'character', label: '人物志' },
  { id: 'artifact', label: '法宝器物' },
  { id: 'atmosphere', label: '天气时序' },
  { id: 'battle', label: '战斗与行动' },
];

function SearchHighlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) return <>{text}</>;
  const folded = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let match = folded.indexOf(needle);
  while (match !== -1) {
    parts.push(text.slice(start, match), <mark key={match}>{text.slice(match, match + term.length)}</mark>);
    start = match + term.length; match = folded.indexOf(needle, start);
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}

function World({ onClose, save, onImportSupplement, isReturningToJourney }: { onClose: () => void; save: LocalSave | undefined; onImportSupplement: (file: File, save: LocalSave) => void; isReturningToJourney: boolean }) {
  const [worldQuery, setWorldQuery] = useState('');
  const [atlasQuery, setAtlasQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [view, setView] = useState<'text' | 'atlas'>('text');
  const [collection, setCollection] = useState<CandidateIllustrationCollection>('world');
  const [selectedIllustration, setSelectedIllustration] = useState<CandidateIllustration | null>(null);
  const [canonSearch, setCanonSearch] = useState<((query: string) => CanonRuntimeEntry[]) | null>(null);
  const [canonEntryCount, setCanonEntryCount] = useState<number | null>(null);
  const [canonLoadFailed, setCanonLoadFailed] = useState(false);
  const firstResultRef = useRef<HTMLDetailsElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    let active = true;
    import('@jiuxiao/content/worldbook').then(module => {
      if (!active) return;
      setCanonSearch(() => module.searchCanonRuntime);
      setCanonEntryCount(module.canonRuntimeEntries.length);
    }).catch(() => {
      if (active) setCanonLoadFailed(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedIllustration && !dialog.open) dialog.showModal();
    else if (!selectedIllustration && dialog.open) dialog.close();
  }, [selectedIllustration]);
  const allEntries = useMemo(() => canonSearch?.('') ?? [], [canonSearch]);
  const queryMatches = useMemo(() => canonSearch?.(worldQuery) ?? [], [canonSearch, worldQuery]);
  const categories = useMemo(() => [...new Set(allEntries.map(entry => entry.category))].sort((a, b) => canonCategoryLabel(a).localeCompare(canonCategoryLabel(b), 'zh-CN')), [allEntries]);
  const entries = useMemo(() => queryMatches.filter(entry => selectedCategory === 'all' || entry.category === selectedCategory), [queryMatches, selectedCategory]);
  const illustrations = CANDIDATE_ILLUSTRATIONS.filter(item => item.collection === collection
    && (!atlasQuery.trim() || `${item.title} ${item.topicTag ?? ''}`.toLocaleLowerCase().includes(atlasQuery.trim().toLocaleLowerCase())));
  return <section className="page world-page"><div className="world-return-bar"><div><span className="eyebrow">{isReturningToJourney ? '行旅仍在原处' : '阅读位置会保留'}</span>{isReturningToJourney && save && <strong>{save.name} · {save.location}</strong>}</div><button className="secondary" onClick={onClose}>{isReturningToJourney ? '返回当前行旅' : '返回上一页'}</button></div><span className="eyebrow">山河地理 · 设定与图鉴</span><h2>世界设定</h2>
    <p>正文收录已审核设定；画卷另列视觉素材，二者各守其界。</p>
    <div className="world-view-switch" role="group" aria-label="世界资料类型">
      <button aria-pressed={view === 'text'} onClick={() => setView('text')}>设定正文</button>
      <button aria-pressed={view === 'atlas'} onClick={() => setView('atlas')}>画卷图鉴 <small>{CANDIDATE_ILLUSTRATIONS.length} 幅视觉稿</small></button>
    </div>
    {view === 'text' && <div id="world-text-panel" aria-label="设定正文">
       <label className="world-search">搜索已审核设定<input type="search" value={worldQuery} onChange={event => setWorldQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && entries.length) { event.preventDefault(); firstResultRef.current?.focus(); firstResultRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); } }} placeholder="试试：中州、海上贸易、妖林外围" aria-label="搜索已审核世界设定" /></label>
      {canonSearch && <div className="world-search-feedback"><p role="status">{worldQuery.trim() ? `“${worldQuery.trim()}”找到 ${entries.length} 条设定` : `共 ${entries.length} 条已审核设定`}</p>{worldQuery.trim() && entries.length > 0 && <button className="secondary" onClick={() => { firstResultRef.current?.focus(); firstResultRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); }}>查看首条结果</button>}{worldQuery && <button className="quiet-action" onClick={() => setWorldQuery('')}>清空搜索</button>}</div>}
      {canonSearch && <div className="worldbook-categories" role="group" aria-label="按设定分类筛选"><button aria-pressed={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>全部 <small>{queryMatches.length}</small></button>{categories.map(category => <button key={category} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>{canonCategoryLabel(category)} <small>{queryMatches.filter(entry => entry.category === category).length}</small></button>)}</div>}
      <div className="worldbook-results" aria-live="polite">{canonLoadFailed ? <p className="worldbook-empty" role="status">设定正文暂时无法载入。请稍后重试；画卷图鉴仍可查看。</p> : !canonSearch ? <p className="worldbook-empty" role="status">正在载入已审核设定……</p> : entries.length ? entries.map((entry, index) => <details className="worldbook-entry" key={entry.id} ref={index === 0 ? firstResultRef : undefined} tabIndex={-1} open={Boolean(worldQuery.trim())}>
      <summary className="worldbook-entry-summary"><span className="eyebrow">{canonCategoryLabel(entry.category)} · Canon {entry.canonVersion}</span><span className="worldbook-entry-title" role="heading" aria-level={3}><SearchHighlight text={entry.title} query={worldQuery} /></span><small>{worldQuery.trim() ? '展开查看匹配内容' : '展开阅读'}</small></summary><div className="worldbook-body"><SearchHighlight text={entry.content} query={worldQuery} /></div>
      {entry.publicSourceNote && <details className="worldbook-source"><summary>来源与整理说明</summary><p>{entry.publicSourceNote}</p></details>}
      </details>) : <p className="worldbook-empty">没有找到这组字词。试试地点名、地貌或文化关键词。</p>}</div>
    </div>}
    {view === 'atlas' && <div id="world-atlas-panel" aria-label="画卷图鉴">
      <div className="atlas-intro"><img src={mediaUrlForBrowser('/scenes/candidate/atlas/brand_calligraphy.webp')} alt="九霄书法题字与云山图" loading="lazy" decoding="async" /><div><span className="eyebrow">案头画卷</span><h3>九霄画卷图鉴</h3><p>按素材原名与题材归卷。点开可细看。</p></div></div>
       <label className="world-search">查找画卷<input type="search" value={atlasQuery} onChange={event => setAtlasQuery(event.target.value)} placeholder="地域、宗门、人物、法宝或氛围" aria-label="搜索画卷图鉴" /></label>
      <div className="atlas-collections" role="group" aria-label="画卷分类">{atlasCollections.map(item => <button key={item.id} aria-pressed={collection === item.id} onClick={() => setCollection(item.id)}>{item.label}<small>{CANDIDATE_ILLUSTRATIONS.filter(art => art.collection === item.id).length} 幅</small></button>)}</div>
      <p className="atlas-boundary">这些画面是候选视觉参考，不构成设定正文或审核证据。人物不绑定具体 NPC，法宝不表示存档已获得；天气与战斗画面也不代表当前游戏状态。设定和状态以已审核文字、规则与存档为准。</p>
      <div className="atlas-grid" aria-live="polite">{illustrations.length ? illustrations.map(illustration => <button className={`atlas-card atlas-card--${illustration.collection}`} key={illustration.id} onClick={() => setSelectedIllustration(illustration)} aria-label={`放大查看：${illustration.title}`}>
        <img src={mediaUrlForBrowser(illustration.src)} alt={illustration.title} loading="lazy" decoding="async" />
         <span>{illustration.title}</span>
      </button>) : <div className="worldbook-empty-state"><p className="worldbook-empty" role="status">当前分类或搜索条件下没有画面。</p><button className="secondary" onClick={() => { setAtlasQuery(""); setCollection("world"); }}>查看全部画卷</button></div>}</div>
      <dialog className="atlas-dialog" ref={dialogRef} aria-labelledby="atlas-dialog-title" onClose={() => setSelectedIllustration(null)}>
        {selectedIllustration && <><button className="atlas-dialog-close" aria-label="关闭画卷" onClick={() => dialogRef.current?.close()}>×</button><img src={mediaUrlForBrowser(selectedIllustration.src)} alt={selectedIllustration.title} /><div><h3 id="atlas-dialog-title">{selectedIllustration.title}</h3><p>候选画影 · 不代表当前存档事实</p></div></>}
      </dialog>
    </div>}
    <div className="card worldbook-scope"><strong>资料范围</strong><p>正文只收录已审核并发布的世界设定{canonEntryCount === null ? '' : `，当前 ${canonEntryCount} 条`}。尚待核验的 OCR 与补充材料不会混入正文；完成审核后再逐条纳入。画卷图鉴中的图片仅作视觉参考，不构成设定依据。</p>
      {save && <label className="secondary file-action world-import">为当前存档附加补充 TXT<input type="file" accept=".txt,.md" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) onImportSupplement(file, save); event.currentTarget.value = ''; }} /></label>}
      <button className="secondary" onClick={onClose}>{isReturningToJourney ? '回到当前行旅与刚才的位置' : '回到刚才的位置'}</button>
    </div>
  </section>;
}

function LegacyArchive({ save }: { save: LocalSave }) {
  const archive = save.legacyArchive;
  if (!archive) return null;
  const entries = Object.entries(archive.payload);
  return <section className="card legacy-archive"><h3>旧档内容与迁移核对</h3><p>原始字段保存在这份存档的历史资料区，不作为新规则结算结果。展开可逐项核对；密钥字段会隐藏，单项预览最多显示 12000 字符。</p><div className="legacy-groups">{entries.map(([key, value]) => {
    const serialized = serializeJsonWithCredentialRedaction(value, key);
    const preview = serialized.slice(0, 12000);
    const summary = Array.isArray(value) ? `${value.length} 项` : value !== null && typeof value === 'object' ? `${Object.keys(value).length} 个字段` : typeof value === 'string' ? `${value.length} 字符` : '已保留';
    return <details key={key}><summary>{key} <small>{summary}</small></summary><pre>{preview}{serialized.length > preview.length ? '\n…预览已截断，完整内容仍保存在存档中。' : ''}</pre></details>;
  })}</div></section>;
}

function visibleLegacyText(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 12000);
  if (Array.isArray(value)) {
    const parts = value.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const block = item as Record<string, unknown>;
      return block.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
    });
    return parts.length ? parts.join('\n').slice(0, 12000) : null;
  }
  if (value && typeof value === 'object') {
    const message = value as Record<string, unknown>;
    if (typeof message.content === 'string') return message.content.slice(0, 12000);
    if (Array.isArray(message.content)) return visibleLegacyText(message.content);
    if (typeof message.text === 'string') return message.text.slice(0, 12000);
  }
  return null;
}

function Game({ save, onExport, onImportSupplement, onUpdate, onBranch, onReload }: { save: LocalSave | undefined; onExport: (save?: LocalSave) => void; onImportSupplement: (file: File, save: LocalSave) => void; onUpdate: (save: LocalSave) => Promise<SaveCommitResult>; onBranch: (save: LocalSave) => Promise<boolean>; onReload: () => Promise<void> }) {
  const [activePanel, setActivePanel] = useState<'character' | 'intel' | 'memory' | null>(null);
  const [intent, setIntent] = useState(() => save ? readActionDraft(save.saveId) : '');
  const [feedback, setFeedback] = useState('');
  const [conflictDraft, setConflictDraft] = useState<LocalSave | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  useLayoutEffect(() => {
    if (!save) return;
    const key = `jiuxiao_1_game_scroll_${save.saveId}`;
    let top = 0;
    try { top = Math.max(0, Number(sessionStorage.getItem(key) || 0)); } catch { /* Position is optional. */ }
    const restore = () => window.scrollTo(0, Math.min(top, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)));
    restore();
    const frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      try { sessionStorage.setItem(key, String(window.scrollY)); } catch { /* Keep the save untouched. */ }
    };
  }, [save?.saveId]);
  if (!save) return <section className="page"><h2>找不到这份存档</h2><p>它可能已被删除，或链接来自另一个浏览器。</p><button className="primary" onClick={() => go('/')}>回到首页</button></section>;
  const pending = save.pending ?? save.legacyArchive?.payload.pending;
  const pendingFromLegacy = save.pending === undefined && pending !== undefined && pending !== null;
  const pendingRecord = pending && typeof pending === 'object' ? pending as Record<string, unknown> : {};
  const pendingText = typeof pending === 'string' ? pending : typeof pendingRecord.text === 'string' ? pendingRecord.text : '';
  const pendingQueue = Array.isArray(save.pendingQueue)
    ? save.pendingQueue.filter(item => item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string') as Array<Record<string, unknown>>
    : [];
  const pendingCount = (pendingText ? 1 : 0) + pendingQueue.length;
  const archive = save.legacyArchive?.payload || {};
  const panelContent = activePanel === 'character' ? {
    '当前角色资料': save.character,
    ...(archive.status === undefined ? {} : { '旧版状态记录': archive.status }),
  } : activePanel === 'intel' ? {
    '当前地点': save.location,
    ...(archive.world === undefined ? {} : { '旧版世界资料': archive.world }),
    ...(archive.intel === undefined ? {} : { '旧版综合情报': archive.intel }),
  } : activePanel === 'memory' ? (
    archive.memory === undefined && archive.stm === undefined && archive.ltm === undefined
      ? { note: '此存档尚无已归档记忆。' }
      : {
        ...(archive.memory === undefined ? {} : { '旧版记忆记录': archive.memory }),
        ...(archive.stm === undefined ? {} : { '短期记忆': archive.stm }),
        ...(archive.ltm === undefined ? {} : { '长期记忆': archive.ltm }),
      }
  ) : null;
  const messageOffset = Math.max(0, save.messages.length - 100);
  const readableMessages = save.messages.slice(-100).map((message, index) => ({ message, index: messageOffset + index, content: visibleLegacyText(message) })).filter(item => item.content !== null).slice(-80);
  async function saveIntent() {
    if (submittingRef.current) return;
    const currentSave = save;
    if (!currentSave) return;
    if (!intent.trim()) { setFeedback('写下此刻要做的事，再收入待处理行动。'); return; }
    if (pendingFromLegacy) { setFeedback('旧档待处理内容仍保留原样，不能直接覆盖。请先导出备份；恢复流程接入后再继续。'); return; }
    if (pendingQueue.length >= 50) { setFeedback('待处理行动已达 50 项上限。当前版本尚不能结算或清空，请先导出存档。'); return; }
    const action = { idempotencyKey: createIdempotencyKey(), text: intent.trim(), source: 'PLAYER_ACTION', gm: false, status: 'pending_rules', createdAt: new Date().toISOString() };
    const nextSave = { ...currentSave, updatedAt: new Date().toISOString(), pendingQueue: [...pendingQueue, action] };
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await onUpdate(nextSave);
      if (!result.ok) {
        if (result.reason === 'conflict') { setConflictDraft(nextSave); setFeedback('这份存档已在另一标签页更新。较新的内容没有被覆盖；可重新载入，或把本次行动另存为分支。'); }
        else setFeedback('本地数据库暂不可写。存档未更新；请导出当前资料，确认浏览器存储可用后重试。');
        return;
      }
      setConflictDraft(null);
      setIntent(''); writeActionDraft(currentSave.saveId, '');
      setFeedback(commitSuccessMessage(result, '行动已加入本地待处理队列。规则结算接入前，它不会推进时间或改变角色状态。'));
    } catch {
      setFeedback('本次行动没有保存。请检查本地存储状态后重试；在收到保存反馈前，不要假定它已写入。');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  return <section className="game-page">
    <header className="game-topline"><div><span className="eyebrow">{save.location} · 本地存档</span><h1>{save.name}</h1></div><button className="quiet-action" onClick={() => go('/lobby')}>离开此局<span>回到山门</span></button></header>
    <div className="game-workspace">
      <aside className="game-rail" aria-label="游戏资料"><button aria-pressed={activePanel === 'character'} onClick={() => setActivePanel(activePanel === 'character' ? null : 'character')}>角色状态</button><button aria-pressed={activePanel === 'intel'} onClick={() => setActivePanel(activePanel === 'intel' ? null : 'intel')}>综合情报</button><button aria-pressed={activePanel === 'memory'} onClick={() => setActivePanel(activePanel === 'memory' ? null : 'memory')}>星记忆</button></aside>
      <div className="story-column"><div className="story-reading" aria-label="剧情记录">
        <div className="chapter-mark"><span>九霄 · {save.location}</span><i aria-hidden="true" /></div>
        {save.messages.length > 80 && <small className="history-limit-note">此处显示最近 80 条可读文字；完整旧档仍保存在下方历史资料中。</small>}
        {readableMessages.map(({ message, index, content }) => {
          const row = message && typeof message === 'object' ? message as Record<string, unknown> : {};
          const role = row.gm === true || row.role === 'assistant' ? '剧情' : row.role === 'user' ? '行者' : '旧档';
          return <article className={`story-message ${role === '剧情' ? 'narration' : 'player-line'}`} key={index}><span>{role}</span><p>{content}</p></article>;
        })}
        {!readableMessages.length && <article className="story-opening"><span>山门未启</span><h2>{save.name}</h2><p>{pendingText ? '此局的开局意图已保存在行囊中。' : '夜色沉在群峰之间。写下你的行动，先将这一念收入存档。'}</p><small>新一回合尚未结算</small></article>}
        {pendingText && <article className="pending-intent"><span>{pendingFromLegacy ? '旧档待处理意图 · 尚未恢复' : '开局意图 · 尚未结算'}</span><p>{pendingText}</p></article>}
        {pendingQueue.map((item, index) => <article className="pending-intent" key={String(item.idempotencyKey || index)}><span>待处理行动 {index + 1} · 尚未结算</span><p>{String(item.text)}</p></article>)}
      </div>
      <div className="game-tools" role="group" aria-label="行囊工具"><button onClick={() => go('/world')}>世界设定</button><button onClick={() => onExport(save)}>导出存档</button><label>补充资料<input type="file" accept=".txt,.md" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) onImportSupplement(file, save); event.currentTarget.value = ''; }} /></label></div>
      <form className="intent-composer" aria-busy={submitting} onSubmit={event => { event.preventDefault(); void saveIntent(); }}><label htmlFor="player-intent">此刻欲行何事</label><textarea id="player-intent" value={intent} onChange={event => { setIntent(event.target.value); writeActionDraft(save.saveId, event.target.value); }} placeholder="写下行动意图……" maxLength={4000} disabled={submitting} /><div><small>本地草稿 · 规则结算尚未接入 · {pendingCount} 项待处理</small><button className="primary" type="submit" disabled={submitting}>{submitting ? '正在保存…' : '收入待处理'}</button></div>{feedback && <p role="status">{feedback}</p>}{conflictDraft && <div className="save-conflict-actions" role="group" aria-label="存档冲突处理"><button className="secondary" type="button" disabled={submitting} onClick={() => { void onReload().then(() => { setConflictDraft(null); setFeedback('已载入最新存档。检查当前行动后，可再次提交。'); }); }}>载入最新存档</button><button className="secondary" type="button" disabled={submitting} onClick={() => { void onBranch(conflictDraft).then(saved => { if (saved) { setConflictDraft(null); setIntent(''); writeActionDraft(save.saveId, ''); setFeedback('冲突内容已另存为独立分支；原存档保持不变。'); } else setFeedback('分支未写入。请先导出冲突副本，并检查本地存储空间。'); }); }}>另存为分支</button><button className="quiet-action" type="button" disabled={submitting} onClick={() => onExport(conflictDraft)}>下载冲突副本</button></div>}</form>      </div>
      {activePanel && <aside className="game-info-panel" aria-label={`${activePanel === 'character' ? '角色状态' : activePanel === 'intel' ? '综合情报' : '星记忆'}详情`}><div><span className="eyebrow">行囊所载</span><button aria-label="关闭资料面板" onClick={() => setActivePanel(null)}>×</button></div><div className="game-readable-panel" aria-label="资料内容"><ReadableData value={panelContent} /></div></aside>}
    </div>
    <div className="game-statusline"><span>存档版本 {save.revision}</span><span>{pendingFromLegacy ? '旧档待恢复' : pendingCount ? `${pendingCount} 项待处理` : '等待规则结算'}</span><span>地点：{save.location}</span></div>
    <LegacyArchive save={save} />
  </section>;
}

function App() {
  const [saves, setSaves] = useState<LocalSave[]>(readSaves);
  useEffect(() => {
    if (!INTERNAL_TURN_WORKSPACE_ENABLED && route() === '/turns') {
      history.replaceState({}, '', '/lobby');
    }
  }, []);
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('jx10_appearance') === 'day' ? 'day' : 'night'; }
    catch { return 'night'; }
  });
  const [notice, setNotice] = useState('');
  const [graphicsSettings, setGraphicsSettings] = useState<GraphicsSettings>(() => ({ ...DEFAULT_GRAPHICS_SETTINGS, ...loadGraphicsSettings() }));
  const [ambientAudioActive, setAmbientAudioActive] = useState(false);
  const [rendererStatus, setRendererStatus] = useState<SceneRenderStatus | null>(null);
  const [scenePreview, setScenePreview] = useState<SceneId | null>(null);
  const ambientAudioRef = useRef<AmbientAudioHandle | null>(null);
  const audioStartingRef = useRef(false);
  const onScenePreview = useCallback((scene: SceneId | null) => setScenePreview(scene), []);
  function updateGraphicsSettings(next: GraphicsSettings) {
    setGraphicsSettings(next);
    saveGraphicsSettings(next);
    ambientAudioRef.current?.setVolume(next.ambienceVolume);
  }
  async function toggleAmbientAudio() {
    if (ambientAudioRef.current) {
      ambientAudioRef.current.stop(); ambientAudioRef.current = null; setAmbientAudioActive(false); return;
    }
    if (audioStartingRef.current) return;
    audioStartingRef.current = true;
    try {
      const engine = await startSyntheticWaterAmbience(graphicsSettings.ambienceVolume);
      ambientAudioRef.current = engine; setAmbientAudioActive(true);
      setNotice('已启用本机合成流水氛围；刷新页面后需再次点击启用。');
    } catch {
      setNotice('此浏览器无法启动环境声。游戏画面与存档不受影响。');
    } finally { audioStartingRef.current = false; }
  }
  const [legacyText, setLegacyText] = useState<string | null>(null);
  const [indexedDbReady, setIndexedDbReady] = useState(true);
  const [importPreview, setImportPreview] = useState<{ save: LocalSave; sourceName: string; expectedSaves: LocalSave[] } | null>(null);
  const [replaceConfirmation, setReplaceConfirmation] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const importBusyRef = useRef(false);
  const supplementBusySaveIdsRef = useRef(new Set<string>());
  const importReadRef = useRef(0);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('jx10_appearance', theme); } catch { /* Appearance remains available for this session. */ }
  }, [theme]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.jxAtmosphere = graphicsSettings.atmosphereEnabled ? 'on' : 'off';
    root.dataset.jxParticles = graphicsSettings.particlesEnabled ? 'on' : 'off';
    root.dataset.jxReducedMotion = graphicsSettings.reducedMotion ? 'on' : 'off';
    root.dataset.jxDataSaver = graphicsSettings.dataSaver ? 'on' : 'off';
  }, [graphicsSettings.atmosphereEnabled, graphicsSettings.particlesEnabled, graphicsSettings.reducedMotion, graphicsSettings.dataSaver]);
  useEffect(() => {
    const onRendererStatus = (event: Event) => setRendererStatus((event as CustomEvent<SceneRenderStatus>).detail);
    window.addEventListener('jx:scene-render-status', onRendererStatus);
    return () => { window.removeEventListener('jx:scene-render-status', onRendererStatus); ambientAudioRef.current?.stop(); };
  }, []);
  useEffect(() => {
    let active = true;
    document.documentElement.dataset.jxStorageHydrated = 'false';
    void hydrateSaves().then(result => {
      if (!active) return;
      setSaves(result.saves); setIndexedDbReady(result.indexedDb);
      if (!result.saves.length) setLegacyText(readLegacyLibraryText());
      if (result.warning) setNotice(result.warning);
      else if (!result.indexedDb) setNotice('IndexedDB 不可用，当前仅使用本地回退存储；原存档不会被删除。');
      document.documentElement.dataset.jxStorageHydrated = 'true';
    });
    const refresh = () => setSaves(readSaves());
    const externalSaveChange = (event: StorageEvent) => {
      if (event.key !== 'jiuxiao_1_local_saves_v2' && event.key !== 'jiuxiao_1_local_saves') return;
      void hydrateSaves().then(result => {
        setSaves(result.saves); setIndexedDbReady(result.indexedDb);
        setNotice(result.warning || '检测到另一个标签页修改了存档。已从本地数据库重新读取；同一存档再次提交前仍会核对版本。');
        document.documentElement.dataset.jxStorageHydrated = 'true';
      });
    };
    addEventListener('popstate', refresh);
    addEventListener('storage', externalSaveChange);
    return () => { active = false; removeEventListener('popstate', refresh); removeEventListener('storage', externalSaveChange); };
  }, []);
  async function migrateLegacyLibrary() {
    if (!legacyText) return;
    downloadText(`九霄-旧localStorage原文备份-${Date.now()}.json`, legacyText, 'application/json;charset=utf-8');
    try {
      const migrated = migrateLegacyLibraryText(legacyText);
      const current = saves; const ids = new Set(current.map(save => save.saveId)); let copied = 0;
      const safeMigrated = migrated.map(save => {
        if (!ids.has(save.saveId)) { ids.add(save.saveId); return save; }
        copied += 1; const copy = { ...save, saveId: createSaveId(), name: `${save.name}（迁移副本）` }; ids.add(copy.saveId); return copy;
      });
      if (!safeMigrated.length) throw new Error('empty migration');
      const result = await commitSaves(saves, [...safeMigrated, ...saves]);
      if (!result.ok) { setSaves(result.saves); setNotice(result.reason === 'conflict' ? '另一个标签页同时修改了存档。旧库和下载的原文备份均保留；请刷新后重新迁移。' : '浏览器数据库不可写。旧库和下载的原文备份均保留。'); return; }
      setSaves(result.saves); setLegacyText(null); setNotice(commitSuccessMessage(result, `已迁移 ${safeMigrated.length} 份旧局。${copied ? `${copied} 份 ID 冲突已另存副本。` : ''}原 localStorage 文本已备份，旧键仍保留。`));
    } catch { setNotice('旧 localStorage 存档无法通过校验，未写入新存储。原键和备份均保留。'); }
  }
  function importFile(file: File) {
    const request = ++importReadRef.current;
    setImportPreview(null);
    setReplaceConfirmation('');
    if (file.size > MAX_IMPORT_BYTES) { setNotice('导入失败：文件超过 20 MiB 上限，原存档未修改。'); return; }
    file.text().then(text => {
      if (request !== importReadRef.current) return;
      downloadFileCopy(file, `九霄-导入前原文备份-${Date.now()}-${file.name}`);
      try {
        const save = parseLegacySave(file, text);
        setImportPreview({ save, sourceName: file.name, expectedSaves: saves }); setNotice(`已读取「${file.name}」。原始文件副本已下载；核对字段后再选择导入。`);
      } catch { setNotice('导入失败：文件格式或内容不符合旧档契约。原文件和已有存档未修改。'); }
    }).catch(() => { if (request === importReadRef.current) setNotice('导入失败：无法读取文件。原存档未修改。'); });
  }
  async function commitImport(strategy: 'keep' | 'replace' | 'copy') {
    if (!importPreview || importBusyRef.current) return;
    const current = saves;
    const existing = current.find(item => item.saveId === importPreview.save.saveId);
    const collision = Boolean(existing);
    if (collision && strategy === 'keep') { setNotice('此档 ID 已存在。请选择“替换现有存档”或“另存副本”。'); return; }
    if (collision && strategy === 'replace' && replaceConfirmation !== existing!.name) {
      setNotice('替换尚未执行。请先输入现有存档的完整名称，再确认覆盖。'); return;
    }
    const candidate = strategy === 'copy' ? { ...importPreview.save, saveId: createSaveId(), name: `${importPreview.save.name}（副本）`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : importPreview.save;
    const next = collision && strategy === 'replace' ? current.map(item => item.saveId === candidate.saveId ? candidate : item) : [candidate, ...current];
    // Replacing requires the version reviewed by the user, even after another
    // tab's storage event has refreshed the visible save list.
    const expected = strategy === 'replace' ? importPreview.expectedSaves : current;
    importBusyRef.current = true; setImportBusy(true);
    try {
      const result = await commitSaves(expected, next);
      if (!result.ok) { setSaves(result.saves); setNotice(result.reason === 'conflict' ? '存档列表刚有变化，导入未覆盖任何内容。请核对最新列表后再选“另存副本”或重试。' : '浏览器数据库不可写，存档尚未导入。已下载的原始备份仍可使用。'); return; }
      setSaves(result.saves); setImportPreview(null); setReplaceConfirmation(''); setNotice(commitSuccessMessage(result, `已导入「${candidate.name}」。原始旧档字段保存在历史资料区。`)); go(`/game/${candidate.saveId}`);
    } catch {
      setNotice('导入没有完成，现有存档未确认变更。请重新载入列表并检查原始备份。');
    } finally {
      importBusyRef.current = false; setImportBusy(false);
    }
  }
  function exportFile(save?: LocalSave) {
    let selectedId = '';
    try { selectedId = sessionStorage.getItem('jiuxiao_active_save_id') || ''; } catch { /* Fall back to the most recently edited save. */ }
    const selected = save ?? saves.find(item => item.saveId === selectedId)
      ?? [...saves].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.saveId.localeCompare(b.saveId))[0];
    if (!selected) { setNotice('暂无可导出的存档。'); return; }
    downloadText(`九霄-${selected.name}.json`, serializeSaveForExport(selected), 'application/json;charset=utf-8');
    setNotice(`「${selected.name}」已导出。`);
  }
  function importSupplement(file: File, save: LocalSave) {
    if (file.size > 100_000) { setNotice('补充资料不可超过 100 KB（100,000 字节），当前存档未修改。'); return; }
    if (supplementBusySaveIdsRef.current.has(save.saveId)) { setNotice('这份存档正在读取补充资料，请等待当前操作完成。'); return; }
    supplementBusySaveIdsRef.current.add(save.saveId);
    void file.text().then(text => {
      const current = saves;
      const target = current.find(item => item.saveId === save.saveId);
      if (!target) { setNotice('找不到目标存档，补充资料未写入。'); return; }
      const payload = target.legacyArchive?.payload || {};
      const existing = Array.isArray(payload.supplements) ? payload.supplements : [];
      const additions = [...existing, { name: file.name, text, source: 'USER_SUPPLIED' }];
      if (additions.length > 20 || new TextEncoder().encode(JSON.stringify(additions)).byteLength > 256_000) {
        setNotice('补充资料已达 20 份或合计 256 KB 上限；本次未写入，原档保持不变。'); return;
      }
      const next: LocalSave = { ...target, updatedAt: new Date().toISOString(), legacyArchive: { sourceFormat: target.legacyArchive?.sourceFormat || 'JIUXIAO_LOCAL', sourceVersion: target.legacyArchive?.sourceVersion ?? null, payload: { ...payload, supplements: additions } } };
      return commitSaves(current, current.map(item => item.saveId === save.saveId ? next : item)).then(result => {
        if (!result.ok) { setSaves(result.saves); setNotice(result.reason === 'conflict' ? '存档在读取补充资料期间发生变化，未覆盖较新版本；请重新附加。' : '浏览器数据库不可写，补充资料没有写入。'); return; }
        setSaves(result.saves); setNotice(commitSuccessMessage(result, `「${file.name}」已附加到「${save.name}」，不会覆盖旧内容。`));
      });
    }).catch(() => setNotice('无法读取该补充资料，存档未修改。')).finally(() => supplementBusySaveIdsRef.current.delete(save.saveId));
  }
  const currentRoute = route();
  const game = currentRoute.startsWith('/game/') ? saves.find(save => save.saveId === currentRoute.split('/')[2]) : undefined;
  let activeSaveId = '';
  try { activeSaveId = sessionStorage.getItem('jiuxiao_active_save_id') || ''; } catch { /* Use the first available save. */ }
  const activeSave = saves.find(item => item.saveId === activeSaveId) || saves[0];
  const worldReturnTarget = history.state?.returnTo;
  const returningToJourney = typeof worldReturnTarget === 'string' && /^\/game\/[^/]+$/.test(worldReturnTarget)
    && worldReturnTarget === `/game/${activeSave?.saveId}`;
  const page = currentRoute === '/new' ? <NewCharacter onSaved={async save => {
    const result = await commitSaves(saves, [save, ...saves]);
    if (!result.ok) { setSaves(result.saves); setNotice(result.reason === 'conflict' ? '存档列表刚有变化，角色尚未创建。请确认后重试。' : '浏览器数据库不可写，角色尚未创建。草稿仍保留。'); return false; }
    setSaves(result.saves); if (result.warning) setNotice(commitSuccessMessage(result, '角色与新存档已创建。')); go(`/game/${save.saveId}`); return true;
  }} /> : currentRoute === '/intro' ? <Introduction onStart={() => go('/new')} onWorld={() => go('/world')} /> : currentRoute === '/world' ? <World onClose={returnFromReading} save={activeSave} onImportSupplement={importSupplement} isReturningToJourney={returningToJourney} /> : currentRoute === '/settings/ai' ? <AiSettings onClose={returnFromReading} /> : currentRoute === '/settings/cloud' ? <CloudSettings saves={saves} onRestore={async archive => {
    const copied = { ...archive, saveId: createSaveId(), name: `${archive.name}（云端副本）`, updatedAt: new Date().toISOString() };
    const expected = readSaves(); const result = await commitSaves(expected, [copied, ...expected]);
    setSaves(result.saves); if (result.ok) setNotice(commitSuccessMessage(result, '云端档已恢复为新副本。')); return result.ok ? copied : null;
  }} /> : currentRoute === '/settings/graphics' ? <GraphicsSettingsPage settings={graphicsSettings} onChange={updateGraphicsSettings} renderer={rendererStatus} ambientAudioActive={ambientAudioActive} onToggleAmbientAudio={() => { void toggleAmbientAudio(); }} onPreviewScene={onScenePreview} /> : currentRoute === '/lobby' ? <WorldHub saves={saves} /> : currentRoute === '/saves' ? <SaveManager saves={saves} onExport={exportFile}
    onRename={async (save, name) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 40) return false;
      if (JSON.stringify(saves.find(item => item.saveId === save.saveId)) !== JSON.stringify(save)) return false;
      const next = saves.map(item => item.saveId === save.saveId ? { ...item, name: trimmed, updatedAt: new Date().toISOString() } : item);
      const result = await commitSaves(saves, next);
      setSaves(result.saves);
      if (result.ok && result.warning) setNotice(commitSuccessMessage(result, '存档名称已更新。'));
      return result.ok;
    }}
    onDelete={async save => {
      if (JSON.stringify(saves.find(item => item.saveId === save.saveId)) !== JSON.stringify(save)) return false;
      const result = await commitSaves(saves, saves.filter(item => item.saveId !== save.saveId));
      setSaves(result.saves);
      if (result.ok) {
        if (result.warning) setNotice(commitSuccessMessage(result, '本地存档已删除。'));
        try { if (sessionStorage.getItem('jiuxiao_active_save_id') === save.saveId) sessionStorage.removeItem('jiuxiao_active_save_id'); }
        catch { /* Navigation remains available. */ }
      }
      return result.ok;
    }} /> : currentRoute === '/turns' ? INTERNAL_TURN_WORKSPACE_ENABLED ? <TurnWorkspace onBack={() => go('/lobby')} onLogin={() => go('/settings/cloud')} /> : <WorldHub saves={saves} /> : currentRoute.startsWith('/game/') ? <Game save={game} onExport={exportFile} onImportSupplement={importSupplement}
    onUpdate={async next => {
      if (!saves.some(item => item.saveId === next.saveId)) {
        return { ok: false, reason: 'conflict', saves, conflictIds: [next.saveId], revision: 0 };
      }
      const result = await commitSaves(saves, saves.map(item => item.saveId === next.saveId ? next : item));
      setSaves(result.saves); return result;
    }}
    onReload={async () => { const result = await hydrateSaves(); setSaves(result.saves); }}
    onBranch={async stale => {
      const now = new Date().toISOString();
      const branch = { ...stale, saveId: createSaveId(), name: `${stale.name}（冲突分支）`, createdAt: now, updatedAt: now };
      const result = await commitSaves(saves, [branch, ...saves]);
      setSaves(result.saves); if (result.ok && result.warning) setNotice(commitSuccessMessage(result, '冲突内容已另存为独立分支；原存档保持不变。')); return result.ok;
    }} /> : <Landing />;
  const migrationAction = legacyText ? <button className="notice-action" onClick={migrateLegacyLibrary}>下载原文备份并迁移</button> : undefined;
  const storageNotice = indexedDbReady ? notice : `${notice} IndexedDB 回退模式。`;
  const activeScene = scenePreview ?? (game ? sceneForLocation(game.location) : 'mountain-gate');
  const importCollision = saves.find(item => item.saveId === importPreview?.save.saveId);
  return <Shell saves={saves} theme={theme} onThemeChange={() => setTheme(current => current === 'night' ? 'day' : 'night')} graphicsSettings={graphicsSettings} ambientAudioActive={ambientAudioActive} onToggleAmbientAudio={() => { void toggleAmbientAudio(); }} sceneId={activeScene} notice={legacyText ? '检测到旧版 localStorage 存档。请先备份原文，再开始迁移。' : storageNotice} noticeAction={migrationAction} onImport={importFile} onExport={() => exportFile()}>{importPreview && <section className="import-preview card" role="dialog" aria-labelledby="import-preview-title" aria-modal="false" aria-busy={importBusy}><span className="eyebrow">旧档导入 / 提交前核对</span><h2 id="import-preview-title">{importPreview.save.name}</h2><p>来源：{importPreview.sourceName}。原始文件已先下载为备份。核对数量与回合，再选择导入方式；所有顶层字段均会原样保存在该存档的历史资料区。</p><div className="stats"><div><small>回合</small><strong>{importPreview.save.revision}</strong></div><div><small>消息</small><strong>{importPreview.save.messages.length}</strong></div><div><small>人物 / 物品</small><strong>{Array.isArray(importPreview.save.legacyArchive?.payload.npcs) ? importPreview.save.legacyArchive.payload.npcs.length : 0} / {Array.isArray(importPreview.save.legacyArchive?.payload.items) ? importPreview.save.legacyArchive.payload.items.length : 0}</strong></div></div><div className="legacy-groups">{Object.entries(importPreview.save.legacyArchive?.payload || {}).map(([key, value]) => <div className="import-field" key={key}><strong>{key}</strong><span>{Array.isArray(value) ? `${value.length} 项` : value !== null && typeof value === 'object' ? `${Object.keys(value).length} 个字段` : typeof value === 'string' ? `${value.length} 字符` : '已保留'}</span></div>)}</div>{importCollision && <label className="replace-save-confirm">覆盖前核对：输入现有存档名称「{importCollision.name}」<input value={replaceConfirmation} onChange={event => setReplaceConfirmation(event.target.value)} disabled={importBusy} autoComplete="off" /></label>}<div className="actions">{!importCollision && <button className="primary" disabled={importBusy} onClick={() => void commitImport('keep')}>{importBusy ? '正在导入…' : '导入此档'}</button>}{importCollision && <><button className="secondary" disabled={importBusy} onClick={() => void commitImport('copy')}>另存为副本</button><button className="primary" disabled={importBusy || replaceConfirmation !== importCollision.name} onClick={() => void commitImport('replace')}>{importBusy ? '正在替换…' : '确认替换现有存档'}</button></>}<button className="secondary" disabled={importBusy} onClick={() => { setImportPreview(null); setReplaceConfirmation(''); setNotice('已取消导入。原存档未修改，原始备份仍保留。'); }}>取消</button></div></section>}{page}</Shell>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(<App />);
