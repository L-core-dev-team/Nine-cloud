/** One coalesced pointer-light scheduler for registered functional surfaces. */
const surfaces = new Set<HTMLElement>();
let active: HTMLElement | null = null;
let frame = 0;
let point = { x: 0, y: 0 };
let detach: (() => void) | undefined;

function reset(surface: HTMLElement | null) {
  surface?.style.removeProperty('--jx-glass-pointer-x');
  surface?.style.removeProperty('--jx-glass-pointer-y');
}

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  reset(active);
  active = null;
}

function attach() {
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const colors = matchMedia('(forced-colors: active)');
  const allowed = (surface: HTMLElement) => pointer.matches && !motion.matches && !transparency.matches && !colors.matches
    && !document.hidden && !surface.matches(':disabled')
    && !surface.closest('[data-jx-motion="reduced"], [data-jx-data-saver="true"]');

  const move = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-liquid-glass]') : null;
    if (event.pointerType === 'touch' || !target || !surfaces.has(target) || !allowed(target)) { stop(); return; }
    if (active !== target) { stop(); active = target; }
    point = { x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!active || !allowed(active)) { stop(); return; }
      const bounds = active.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(0, Math.min(100, (point.x - bounds.left) / bounds.width * 100));
      const y = Math.max(0, Math.min(100, (point.y - bounds.top) / bounds.height * 100));
      active.style.setProperty('--jx-glass-pointer-x', `${x.toFixed(2)}%`);
      active.style.setProperty('--jx-glass-pointer-y', `${y.toFixed(2)}%`);
    });
  };
  const leave = (event: PointerEvent) => {
    if (active && (!(event.relatedTarget instanceof Node) || !active.contains(event.relatedTarget))) stop();
  };
  const settings = (event: Event) => {
    const detail = (event as CustomEvent<{ reducedMotion?: boolean; dataSaver?: boolean }>).detail;
    if (detail?.reducedMotion || detail?.dataSaver) stop();
  };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerout', leave, { passive: true });
  window.addEventListener('blur', stop);
  window.addEventListener('jx:graphics-settings-changed', settings);
  document.addEventListener('visibilitychange', stop);
  for (const query of [pointer, motion, transparency, colors]) query.addEventListener('change', stop);
  return () => {
    stop();
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerout', leave);
    window.removeEventListener('blur', stop);
    window.removeEventListener('jx:graphics-settings-changed', settings);
    document.removeEventListener('visibilitychange', stop);
    for (const query of [pointer, motion, transparency, colors]) query.removeEventListener('change', stop);
  };
}

export function registerLightSurface(surface: HTMLElement): () => void {
  surfaces.add(surface);
  if (!detach) detach = attach();
  return () => {
    if (active === surface) stop();
    reset(surface);
    surfaces.delete(surface);
    if (!surfaces.size) { detach?.(); detach = undefined; }
  };
}
