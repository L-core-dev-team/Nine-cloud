import { useState, type CSSProperties } from 'react';
import { ArmillaryRing, Monogram, MoonGate, Seal } from '../ui/Ornaments';
import { ReadingPrefsDialog, useReadingPrefs } from '../ui/ReadingPrefs';
import '../design-system/tokens-v2.css';
import '../design-system/jx-e.css';
import '../design-system/story-e.css';
import './design-specimen.css';

/**
 * /__design — development-only living specimen for JX-UI-E-01 (03 §4.5).
 * Every text below is sample content for the design system, never product data.
 * Production builds redirect this path to / and tree-shake this module.
 */
const SWATCHES: [string, string, string][] = [
  ['玄夜', '--jx-c-xuan-900', '夜间画布'], ['夜笺', '--jx-c-xuan-850', '夜读页面'], ['深海青', '--jx-c-xuan-700', '抬升面'],
  ['月白', '--jx-c-yue-100', '夜读正文'], ['灵玉青', '--jx-c-jade-400', '交互强调'], ['深灵玉', '--jx-c-jade-700', '晴昼强调'],
  ['香槟金', '--jx-c-gold-400', '仪式装饰'], ['星雾紫', '--jx-c-xingwu-400', '仅大气渲染'], ['宣纸', '--jx-c-zhi-200', '晴昼画布'],
  ['墨', '--jx-c-mo-800', '晴昼正文'], ['朱印', '--jx-c-seal-600', '品牌印记'],
];
const PIGMENTS = ['石青', '石绿', '朱砂', '藤黄', '胭脂', '赭石', '花青', '月白'];

export function DesignSpecimen() {
  const [theme, setTheme] = useState<'night' | 'day'>(() => document.documentElement.dataset.theme === 'day' ? 'day' : 'night');
  const [drawKey, setDrawKey] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useReadingPrefs();
  const toggleTheme = () => { const next = theme === 'night' ? 'day' : 'night'; document.documentElement.dataset.theme = next; setTheme(next); };
  return <div className="jx-shell jx-specimen" data-jx-layer="lobby">
    <header className="jx-specimen-bar">
      <span className="jx-specimen-brand"><Seal />九霄 · 设计样板</span>
      <span className="jx-specimen-note">开发专用，所有文字均为样例。</span>
      <button type="button" className="secondary" onClick={toggleTheme}>切换到{theme === 'night' ? '晴昼' : '夜色'}</button>
    </header>

    <section className="jx-specimen-section">
      <h2>色彩：一种颜色只做一件事</h2>
      <div className="jx-specimen-swatches">{SWATCHES.map(([name, variable, role]) => <figure key={variable}><span style={{ background: `var(${variable})` }} /><figcaption><b>{name}</b>{role}<code>{variable}</code></figcaption></figure>)}</div>
      <div className="jx-specimen-pigments">{PIGMENTS.map((name, index) => <span key={name} style={{ '--jx-speaker': `var(--jx-pigment-${index + 1})` } as CSSProperties}><i />{name}</span>)}</div>
    </section>

    <section className="jx-specimen-section">
      <h2>字体：三个声部</h2>
      <div className="jx-specimen-voices">
        <div><small>题字 · 马善政楷书</small><p className="jx-specimen-brandword">九霄</p></div>
        <div><small>书卷 · 思源宋体</small><p className="jx-specimen-literary">渡船靠在石阶下，船篷上落了一层薄霜。远处有人在吹埙，声音被水面压得很低。</p></div>
        <div><small>案头 · 系统无衬线</small><p className="jx-specimen-ui">保存设置　模型未配置　调用次数 0 / 120</p></div>
      </div>
    </section>

    <section className="jx-specimen-section">
      <h2>签名元素</h2>
      <div className="jx-specimen-ornaments">
        <figure><ArmillaryRing key={drawKey} draw className="jx-specimen-ring" /><figcaption>浑天环 · <button type="button" className="secondary" onClick={() => setDrawKey(key => key + 1)}>重放开天</button></figcaption></figure>
        <figure><span className="jx-specimen-gate"><MoonGate image="/scenes/candidate/mountain-gate.desktop.webp" /></span><figcaption>月洞门</figcaption></figure>
        <figure><Seal size="lg" /><figcaption>朱印</figcaption></figure>
        <figure><span className="jx-specimen-monos">{['沈砚', '白芷', '陆长卿', '云岫'].map(name => <Monogram key={name} name={name} />)}</span><figcaption>首字占位</figcaption></figure>
      </div>
    </section>

    <section className="jx-specimen-section">
      <h2>按钮与控件</h2>
      <div className="jx-specimen-row">
        <button type="button" className="primary">进入世界</button>
        <button type="button" className="secondary">导入角色卡</button>
        <button type="button" className="quiet-action">跳过设置</button>
        <button type="button" className="primary" disabled>提交行动</button>
        <button type="button" className="jx-reading-prefs-toggle" onClick={() => setPrefsOpen(true)}>Aa</button>
      </div>
      <div className="jx-specimen-empty jx-empty"><ArmillaryRing compact /><p>还没有角色卡。导入一张 PNG 或 JSON 卡片开始。</p><button type="button" className="primary">导入角色卡</button></div>
    </section>

    <section className="jx-specimen-section" data-jx-layer="story">
      <h2>书阁：单人与群像</h2>
      <div className="game-frame jx-specimen-story"><div className="story-reading">
        <section className="card card-session-turn"><h2 className="jx-turn-no">开场</h2><p className="jx-narrative">芦花渡的雾还没散。渡船靠在石阶下，船篷上落了一层薄霜。</p></section>
        <section className="card card-session-turn"><h2 className="jx-turn-no">行动 3</h2><p className="jx-act">推门进去，看看屋里有没有人。</p><h3 className="jx-visually-hidden">剧情</h3><p className="jx-narrative">门轴发出一声干涩的响。屋里没有点灯，只有灶膛里一点将熄的炭火。</p></section>
        {[['沈砚', 1, '我去。东门外那片芦苇，我小时候常走。'], ['白芷', 5, '你一个人？……我同你一起。']].map(([name, pigment, body]) => <section key={String(name)} className="card card-session-turn jx-speaker-turn" style={{ '--jx-speaker': `var(--jx-pigment-${pigment})` } as CSSProperties}><h3 className="jx-speaker" data-initial={String(name).slice(0, 1)}>{name}<span className="jx-speaker-id"> · 3f2a1b9c</span></h3><p>{body}</p></section>)}
        <section className="card card-session-pending jx-receipt"><p>请求状态：unknown。请勿刷新或离开页面。</p><div className="actions"><button type="button">查询原请求</button><button type="button">核对过期请求</button></div></section>
      </div></div>
    </section>

    <section className="jx-specimen-section" data-jx-layer="story">
      <h2>成卷 · 小说阅读模式 <small>概念稿，未实现</small></h2>
      <article className="jx-specimen-novel">
        <nav aria-label="目录（概念）"><b>目录</b><span>第一回　芦花渡</span><span>第二回　东门夜巡</span><span>第三回（第 21–30 回合）</span></nav>
        <div><h3>第一回　芦花渡</h3><p>芦花渡的雾还没散。渡船靠在石阶下，船篷上落了一层薄霜。远处有人在吹埙，声音被水面压得很低。</p><p className="jx-specimen-note-act">你推门进去，看看屋里有没有人。</p><p>门轴发出一声干涩的响。屋里没有点灯，只有灶膛里一点将熄的炭火，把墙上挂着的蓑衣照出半个影子。</p></div>
      </article>
      <p className="jx-specimen-note">分章只按已存字段确定（地点变化或每 10 回合）；AI 章节标题、润色与 EPUB/PDF 导出没有接口，不进入可用产品。</p>
    </section>
    {prefsOpen && <ReadingPrefsDialog prefs={prefs} onChange={setPrefs} onClose={() => setPrefsOpen(false)} />}
  </div>;
}
