import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createGateScene, GATE_LOOP_SECONDS, type GateScene } from '@jiuxiao/scene-gate';
import desktopPoster from '../../web/public/scenes/candidate/mountain-gate.desktop.webp?url';
import mobilePoster from '../../web/public/scenes/candidate/mountain-gate.mobile.webp?url';
import './style.css';

declare global { interface Window { __gateStudio?: { renderAt: (time: number) => void; resize: (width: number, height: number) => void } } }
const exportMode = new URLSearchParams(location.search).has('export');
const stillMode = new URLSearchParams(location.search).has('still');

function Studio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GateScene | null>(null);
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!exportMode && (matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)) {
      setError('已按系统设置显示静态海报。');
      return;
    }
    let scene: GateScene;
    try { scene = createGateScene(canvas, canvas.clientWidth, canvas.clientHeight); }
    catch { setError('WebGL 无法启动。请查看静态山门海报。'); return; }
    sceneRef.current = scene;
    let raf = 0;
    const start = performance.now();
    const animate = (now: number) => { scene.renderAt((now - start) / 1000 % GATE_LOOP_SECONDS); raf = requestAnimationFrame(animate); };
    if (!exportMode && !stillMode) raf = requestAnimationFrame(animate);
    const onContextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(raf); setError('图形上下文已中断，已切换静态海报。'); };
    canvas.addEventListener('webglcontextlost', onContextLost);
    const observer = new ResizeObserver(() => scene.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio || 1, 2)));
    observer.observe(canvas);
    window.__gateStudio = {
      renderAt(value) { scene.renderAt(value); },
      resize(width, height) { scene.resize(width, height, 1); },
    };
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('webglcontextlost', onContextLost); observer.disconnect(); delete window.__gateStudio; scene.dispose(); sceneRef.current = null; };
  }, []);
  const startPoint = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  return <main className={exportMode ? 'export-mode' : 'studio'}>
    {!exportMode && <header><span>九霄 / 场景工作台</span><strong>月下山门</strong><small>内部视觉试验 · 非玩法实录 · 来源与作者审核待完成</small></header>}
    <div className="stage" style={exportMode ? { width: '100vw', height: '100vh' } : undefined}>
      <canvas ref={canvasRef} aria-label="月下山门三维场景" onPointerDown={event => { if (exportMode) return; event.currentTarget.setPointerCapture(event.pointerId); startPoint.current = { x: event.clientX, y: event.clientY, offsetX: offset.current.x, offsetY: offset.current.y }; }} onPointerMove={event => { const start = startPoint.current; if (!start) return; offset.current = { x: Math.max(-1, Math.min(1, start.offsetX + (event.clientX - start.x) / 260)), y: Math.max(-0.38, Math.min(0.38, start.offsetY - (event.clientY - start.y) / 350)) }; sceneRef.current?.setCameraOffset(offset.current.x, offset.current.y); }} onPointerUp={() => { startPoint.current = null; }} onPointerCancel={() => { startPoint.current = null; }} />
      {error && <div className="fallback" role="status"><picture><source media="(max-width: 700px)" srcSet={mobilePoster} /><img src={desktopPoster} alt="月下山门静态海报" /></picture><span>{error}</span></div>}
    </div>
    {!exportMode && <aside><p>在山门前小幅拖动，观察石阶、门柱与远山的空间关系。场景不响应行动输入，也不产生规则结果。</p><button onClick={() => { offset.current = { x: 0, y: 0 }; sceneRef.current?.resetCamera(); }}>重置视角</button><label>检查固定时间 <input type="range" min="0" max="8" step="0.01" value={time} onChange={event => { const next = Number(event.target.value); setTime(next); sceneRef.current?.renderAt(next); }} /></label></aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Studio />);
