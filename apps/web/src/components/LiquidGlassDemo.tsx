import { useEffect, useState } from 'react';
import { LiquidGlass, LiquidGlassFilters } from './LiquidGlass';
import './liquid-glass-demo.css';

const filterReference = 'url(#jx-liquid-glass-refract)';

export function LiquidGlassDemo() {
  const [theme, setTheme] = useState<'night' | 'day'>('night');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState('世界');
  const [scrollHint, setScrollHint] = useState('背景可透射');
  const params = new URLSearchParams(window.location.search);
  const forceBlurBaseline = params.get('glass') === 'blur';
  const hasSvgBackdropFilterSyntax = typeof CSS !== 'undefined'
    && (CSS.supports('backdrop-filter', filterReference) || CSS.supports('-webkit-backdrop-filter', filterReference));
  const hasSvgElementFilterSyntax = typeof CSS !== 'undefined' && CSS.supports('filter', filterReference);

  useEffect(() => {
    const updateScrollState = () => {
      const next = window.scrollY > 16 ? '滚动背景响应中' : '背景可透射';
      setScrollHint(current => current === next ? current : next);
    };
    window.addEventListener('scroll', updateScrollState, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollState);
  }, []);

  return <div className={`liquid-lab liquid-lab--${theme}`} data-theme={theme} data-svg-lens={hasSvgBackdropFilterSyntax ? 'available' : 'fallback'} data-glass-force-blur={forceBlurBaseline ? 'true' : undefined}>
    <LiquidGlassFilters />
    <LiquidGlass as="header" variant="regular" className="liquid-lab-nav">
      <a className="liquid-lab-brand" href="/" aria-label="返回九霄首页">九霄<span>· 清透材质试验</span></a>
      <nav className="liquid-lab-tabs" aria-label="样板导航">
        {['世界', '行旅', '设置'].map(item => <button key={item} type="button" aria-pressed={selected === item} onClick={() => setSelected(item)}>{item}</button>)}
      </nav>
      <div className="liquid-lab-nav-actions">
        <button type="button" onClick={() => setTheme(value => value === 'night' ? 'day' : 'night')} aria-label={theme === 'night' ? '切换明亮环境' : '切换深色环境'}>{theme === 'night' ? '昼' : '夜'}</button>
        <div className="liquid-lab-menu-anchor">
          <button type="button" className="liquid-lab-menu-trigger" aria-expanded={menuOpen} aria-controls="liquid-lab-menu" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? '收起' : '菜单'}</button>
          <div id="liquid-lab-menu" className="liquid-lab-popover-wrap" data-open={menuOpen}>
            <LiquidGlass as="div" variant="regular" className="liquid-lab-popover" aria-hidden={!menuOpen} inert={!menuOpen}>
              <strong>浮层操作</strong>
              <button type="button" onClick={() => { setSelected('世界'); setMenuOpen(false); }}>查看世界内容</button>
              <button type="button" onClick={() => { setSelected('行旅'); setMenuOpen(false); }}>返回行旅界面</button>
              <small>菜单从触发控件附近展开，背景仍可见。</small>
            </LiquidGlass>
          </div>
        </div>
      </div>
    </LiquidGlass>

    <main className="liquid-lab-content">
      <section className="liquid-lab-hero" aria-labelledby="liquid-lab-title">
        <div className="liquid-lab-copy">
          <span className="liquid-lab-kicker">月下山门 · 实时环境材质</span>
          <h1 id="liquid-lab-title">光过其上，境仍在下</h1>
          <p>这是一张独立可运行的浏览器样板。滚动内容、切换明暗、移动指针或按下控件，观察材质如何回应。</p>
          <LiquidGlass as="button" type="button" variant="clear" className="liquid-lab-primary" onClick={() => setScrollHint('已触发：按钮按压反馈完成')}>
            <span className="liquid-lab-primary-icon" aria-hidden="true">✦</span>
            <span><strong>进入山门</strong><small>{scrollHint}</small></span>
          </LiquidGlass>
          <div className="liquid-lab-segment" role="group" aria-label="测试控件形态过渡">
            {['轻触', '长按', '返回'].map(item => <button type="button" key={item} aria-pressed={selected === item} onClick={() => setSelected(item)}>{item}</button>)}
          </div>
        </div>
      </section>

      <section className="liquid-lab-notes" aria-label="明暗复杂背景与滚动内容">
        <span className="liquid-lab-kicker">同一材质 · 两种环境</span>
        <h2>内容仍是主角</h2>
        <p>下方文字与图像持续滚动经过导航和浮层。Regular 用于文字较多的控件；Clear 留给富媒体背景上的单个醒目动作。</p>
        <div className="liquid-lab-scene-grid" aria-hidden="true">
          <figure><img src="/scenes/gate-moonlight-mobile.webp" alt="" /><figcaption>夜色山门</figcaption></figure>
          <figure><img src="/scenes/candidate/mountain-gate.mobile.webp" alt="" /><figcaption>山水光色</figcaption></figure>
          <figure><img src="/scenes/candidate/sect-town.mobile.webp" alt="" /><figcaption>暖色人间</figcaption></figure>
        </div>
        <div className="liquid-lab-reading">
          {Array.from({ length: 4 }, (_, index) => <p key={index}>山影随滚动从玻璃之后掠过。高光保持轻盈，边缘折射只做小范围位移；无连续动画，也不对全屏内容运行着色器。第 {index + 1} 段用来观察滚动时的透光、明暗和文字分离。</p>)}
        </div>
      </section>
    </main>

    <LiquidGlass as="button" type="button" variant="clear" className="liquid-lab-float" aria-label="浮动操作按钮" onClick={() => setScrollHint('浮动控件已响应')}>↗</LiquidGlass>
    <footer className="liquid-lab-status"><span>原生 Apple Glass：网页不具备</span><span>背景 SVG URL：{hasSvgBackdropFilterSyntax ? '可用' : '当前浏览器不支持'}</span><span>SVG 图像滤镜：{hasSvgElementFilterSyntax ? '可用，受限背景克隆样板' : '当前浏览器不支持'}</span><a href="/">回到九霄</a></footer>
  </div>;
}
