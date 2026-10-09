import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './game-shell.css';

/** Presentation only: callers retain their own save, draft and turn handlers. */
export function GameShell({ saveId, children, archive, readingReady = true }: { saveId: string; children: ReactNode; archive?: ReactNode; readingReady?: boolean }) {
  const frame = useRef<HTMLElement>(null);
  const [showArchive, setShowArchive] = useState(false);
  useLayoutEffect(() => {
    if (!readingReady) return;
    const reading = frame.current?.querySelector<HTMLElement>('.story-reading');
    if (!reading) return;
    const key = `jiuxiao_1_game_scroll_${saveId}`;
    let top = 0;
    try { const saved = Number(sessionStorage.getItem(key)); top = Number.isFinite(saved) ? Math.max(0, saved) : 0; } catch { /* Reading position is optional. */ }
    const restore = () => { reading.scrollTop = top; };
    const remember = () => { try { sessionStorage.setItem(key, String(reading.scrollTop)); } catch { /* Never affect the save or action draft. */ } };
    restore();
    const animation = requestAnimationFrame(restore);
    reading.addEventListener('scroll', remember, { passive: true });
    return () => { cancelAnimationFrame(animation); reading.removeEventListener('scroll', remember); };
  }, [saveId, readingReady]);
  useLayoutEffect(() => {
    const shell = frame.current?.closest<HTMLElement>('.jx-shell');
    const viewport = window.visualViewport;
    if (!shell || !viewport) return;
    const resize = () => {
      // Keep pinch zoom available; only compensate for browser chrome / the keyboard.
      if (viewport.scale !== 1) return;
      shell.style.setProperty('--jx-game-viewport-height', `${viewport.height}px`);
      shell.style.setProperty('--jx-game-viewport-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize);
      shell.style.removeProperty('--jx-game-viewport-height'); shell.style.removeProperty('--jx-game-viewport-top');
    };
  }, []);
  return <section ref={frame} className="game-page game-frame">
    {children}
    {archive && <button className="game-archive-toggle secondary" onClick={() => setShowArchive(true)}>旧档资料与迁移核对</button>}
    {showArchive && <GameInfoDialog label="旧档资料与迁移核对" onClose={() => setShowArchive(false)}>{archive}</GameInfoDialog>}
  </section>;
}

export function GameInfoDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialogRef} className="game-info-dialog" aria-label={`${label}详情`} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')).filter(control => control.getClientRects().length > 0);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="game-info-dialog-heading"><h2>{label}</h2><button type="button" aria-label="关闭资料面板" onClick={onClose}>×</button></div>
    <div className="game-info-dialog-body">{children}</div>
  </dialog>;
}
