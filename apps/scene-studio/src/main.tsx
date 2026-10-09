import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GateScene } from '@jiuxiao/scene-gate';
import landscapeEnvironment from './assets/gate-environment-landscape.webp?url';
import portraitEnvironment from './assets/gate-environment-portrait.webp?url';
import desktopPoster from '../../web/public/scenes/candidate/mountain-gate.desktop.webp?url';
import mobilePoster from '../../web/public/scenes/candidate/mountain-gate.mobile.webp?url';
import './style.css';

declare global { interface Window { __gateStudio?: { ready: () => Promise<void>; renderAt: (time: number) => void; resize: (width: number, height: number) => void } } }
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
    let scene: GateScene | null = null;
    let raf = 0;
    let mounted = true;
    let failed = false;
    let observer: ResizeObserver | null = null;
    let automationApi: Window['__gateStudio'];
    const clearAutomationApi = () => {
      if (automationApi && window.__gateStudio === automationApi) delete window.__gateStudio;
    };
    const showFallback = (message: string) => {
      if (!mounted || failed) return;
      failed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      observer?.disconnect();
      try { scene?.dispose(); } catch { /* The poster remains usable if graphics cleanup fails. */ }
      if (sceneRef.current === scene) sceneRef.current = null;
      clearAutomationApi();
      setError(message);
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      showFallback('图形上下文已中断，已切换静态海报。');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    setError(exportMode || stillMode ? '' : '三维场景载入中。');
    const initialize = async () => {
      try {
        const { createGateScene, GATE_LOOP_SECONDS } = await import('@jiuxiao/scene-gate');
        if (!mounted) return;
        const activeScene = createGateScene(
          canvas,
          canvas.clientWidth,
          canvas.clientHeight,
          { landscape: landscapeEnvironment, portrait: portraitEnvironment },
          { preserveDrawingBuffer: exportMode || stillMode },
        );
        scene = activeScene;
        sceneRef.current = activeScene;
        observer = new ResizeObserver(() => activeScene.resize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio || 1, 2)));
        observer.observe(canvas);
        if (import.meta.env.DEV) {
          automationApi = {
            ready() { return activeScene.ready; },
            renderAt(value) { activeScene.renderAt(value); },
            resize(width, height) { activeScene.resize(width, height, 1); },
          };
          window.__gateStudio = automationApi;
        }
        void activeScene.ready.then(() => {
          if (mounted && !failed) setError('');
        }).catch(() => showFallback('山水环境图未能载入，已切换静态海报。'));
        const start = performance.now();
        const animate = (now: number) => {
          if (!mounted || failed) return;
          activeScene.renderAt((now - start) / 1000 % GATE_LOOP_SECONDS);
          raf = requestAnimationFrame(animate);
        };
        if (!exportMode && !stillMode) raf = requestAnimationFrame(animate);
      } catch {
        showFallback('WebGL 无法启动。请查看静态山门海报。');
      }
    };
    void initialize();
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      observer?.disconnect();
      clearAutomationApi();
      if (sceneRef.current === scene) sceneRef.current = null;
      scene?.dispose();
    };
  }, []);
  const startPoint = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const moveCamera = (deltaX: number, deltaY: number) => {
    offset.current = {
      x: Math.max(-1, Math.min(1, offset.current.x + deltaX)),
      y: Math.max(-0.38, Math.min(0.38, offset.current.y + deltaY)),
    };
    sceneRef.current?.setCameraOffset(offset.current.x, offset.current.y);
  };
  const resetCamera = () => {
    offset.current = { x: 0, y: 0 };
    sceneRef.current?.resetCamera();
  };
  return <main className={exportMode ? 'export-mode' : 'studio'}>
    {!exportMode && <header><span>九霄 / 场景工作台</span><strong>月下山门</strong><small>内部视觉试验 · 非玩法实录 · 来源与作者审核待完成</small></header>}
    <div className="stage" style={exportMode ? { width: '100vw', height: '100vh' } : undefined}>
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="可交互的月下山门三维场景"
        aria-describedby={exportMode ? undefined : 'scene-instructions'}
        tabIndex={exportMode ? -1 : 0}
        onKeyDown={event => {
          const step = 0.18;
          if (event.key === 'ArrowLeft') moveCamera(-step, 0);
          else if (event.key === 'ArrowRight') moveCamera(step, 0);
          else if (event.key === 'ArrowUp') moveCamera(0, step * 0.55);
          else if (event.key === 'ArrowDown') moveCamera(0, -step * 0.55);
          else if (event.key === 'Home') resetCamera();
          else return;
          event.preventDefault();
        }}
        onPointerDown={event => {
          if (exportMode || event.button !== 0 || startPoint.current) return;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          startPoint.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: offset.current.x, offsetY: offset.current.y };
        }}
        onPointerMove={event => {
          const start = startPoint.current;
          if (!start || start.pointerId !== event.pointerId) return;
          offset.current = {
            x: Math.max(-1, Math.min(1, start.offsetX + (event.clientX - start.x) / 260)),
            y: Math.max(-0.38, Math.min(0.38, start.offsetY - (event.clientY - start.y) / 350)),
          };
          sceneRef.current?.setCameraOffset(offset.current.x, offset.current.y);
        }}
        onPointerUp={event => { if (startPoint.current?.pointerId === event.pointerId) startPoint.current = null; }}
        onPointerCancel={event => { if (startPoint.current?.pointerId === event.pointerId) startPoint.current = null; }}
        onLostPointerCapture={event => { if (startPoint.current?.pointerId === event.pointerId) startPoint.current = null; }}
      />
      {error && <div className="fallback" role="status"><picture><source media="(max-width: 700px)" srcSet={mobilePoster} /><img src={desktopPoster} alt="月下山门静态海报" /></picture><span>{error}</span></div>}
    </div>
    {!exportMode && !error && <aside><p id="scene-instructions">在山门前小幅拖动，或聚焦画面后按方向键观察；按 Home 重置。场景不响应行动输入，也不产生规则结果。</p><button onClick={resetCamera}>重置视角</button><label>检查固定时间 <input type="range" min="0" max="8" step="0.01" value={time} onChange={event => { const next = Number(event.target.value); setTime(next); sceneRef.current?.renderAt(next); }} /></label></aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Studio />);
