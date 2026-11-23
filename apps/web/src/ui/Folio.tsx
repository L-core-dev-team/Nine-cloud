import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './folio-e.css';

/**
 * P12 成卷 (JX-UI-E-01): a read-only book view of an existing session history.
 *
 * Two forms of the same text. 横排 is a printed page. 竖排 is a 手卷 — a handscroll
 * read from right to left between silk mounting bands, with 乌丝栏 column rules —
 * so "成卷" is literal. The player's own actions appear as 朱批, red-ink notes in
 * the margin of the story. Chapters are cut by a fixed rule from stored fields only
 * (every ten actions); nothing here generates, rewrites or exports text.
 */

export type FolioPart = { speaker?: string | undefined; pigment?: number | undefined; text: string };
export type FolioTurn = { key: string; label: number; action: string; parts: FolioPart[] };
export type FolioBook = { title: string; opening?: string | undefined; turns: FolioTurn[] };
export type FolioChapter = { index: number; title: string; range: string; turns: FolioTurn[] };

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 1 → 一, 10 → 十, 12 → 十二, 20 → 二十, 105 → 一百零五. */
export function chineseNumeral(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return String(value);
  if (value < 10) return DIGITS[value]!;
  if (value < 20) return `十${value % 10 ? DIGITS[value % 10] : ''}`;
  if (value < 100) return `${DIGITS[Math.floor(value / 10)]}十${value % 10 ? DIGITS[value % 10] : ''}`;
  if (value < 1000) {
    const rest = value % 100;
    return `${DIGITS[Math.floor(value / 100)]}百${rest === 0 ? '' : rest < 10 ? `零${DIGITS[rest]}` : rest < 20 ? `一${chineseNumeral(rest)}` : chineseNumeral(rest)}`;
  }
  return String(value);
}

/** Deterministic chapters: every `size` actions form one 回, titled 第N回 with the action range. */
export function folioChapters(turns: FolioTurn[], size = 10): FolioChapter[] {
  const chapters: FolioChapter[] = [];
  for (let start = 0; start < turns.length; start += size) {
    const slice = turns.slice(start, start + size);
    const first = slice[0]!.label, last = slice.at(-1)!.label;
    chapters.push({ index: chapters.length, title: `第${chineseNumeral(chapters.length + 1)}回`, range: first === last ? `行动 ${first}` : `行动 ${first}–${last}`, turns: slice });
  }
  return chapters;
}

const paragraphs = (text: string) => text.split(/\n+/).map(line => line.trim()).filter(Boolean);

type Orientation = 'horizontal' | 'vertical';
type Prefs = { orientation: Orientation; justify: boolean };
const PREFS_KEY = 'jx_folio_v1';
function readPrefs(): Prefs {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
    return { orientation: value.orientation === 'vertical' ? 'vertical' : 'horizontal', justify: value.justify !== false };
  } catch { return { orientation: 'horizontal', justify: true }; }
}

export function Folio({ book, onClose }: { book: FolioBook; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [toc, setToc] = useState(false);
  const chapters = useMemo(() => folioChapters(book.turns), [book.turns]);
  const update = (next: Partial<Prefs>) => setPrefs(old => { const value = { ...old, ...next }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* per-viewer convenience only */ } return value; });

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Vertical type needs a face with vertical metrics; the self-hosted serif has them.
    void import('../design-system/fonts.css').catch(() => undefined);
    element.showModal();
    scroller.current?.focus({ preventScroll: true });
    return () => { if (element.open) element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  // A handscroll moves sideways: let an ordinary wheel unroll it.
  useEffect(() => {
    const element = scroller.current;
    if (!element || prefs.orientation !== 'vertical') return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      element.scrollLeft -= event.deltaY;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [prefs.orientation]);

  const jump = (index: number) => {
    const target = scroller.current?.querySelector(`#jx-folio-${index}`);
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ block: 'start', inline: 'start', behavior: still ? 'auto' : 'smooth' });
    setToc(false);
    scroller.current?.focus({ preventScroll: true });
  };
  const total = book.turns.length;

  return <dialog ref={dialog} className="jx-folio" data-orientation={prefs.orientation} data-justify={prefs.justify ? 'true' : 'false'} aria-label="成卷阅读" onCancel={event => { event.preventDefault(); if (toc) setToc(false); else onClose(); }}>
    <div className="jx-folio-bar">
      <button type="button" className="jx-folio-tocbtn" aria-expanded={toc} aria-controls="jx-folio-toc" disabled={!chapters.length} onClick={() => setToc(open => !open)}>目录</button>
      <p className="jx-folio-title">{book.title}</p>
      <div className="jx-folio-switch" role="group" aria-label="排版方向">
        <button type="button" aria-pressed={prefs.orientation === 'horizontal'} onClick={() => update({ orientation: 'horizontal' })}>横排</button>
        <button type="button" aria-pressed={prefs.orientation === 'vertical'} onClick={() => update({ orientation: 'vertical' })}>竖排</button>
      </div>
      <button type="button" className="jx-folio-justify" aria-pressed={prefs.justify} onClick={() => update({ justify: !prefs.justify })}>两端对齐</button>
      <button type="button" className="jx-folio-close" onClick={onClose}>退出成卷</button>
    </div>
    {toc && <nav id="jx-folio-toc" className="jx-folio-toc" aria-label="目录">
      <ol>{chapters.map(chapter => <li key={chapter.index}><button type="button" onClick={() => jump(chapter.index)}><span>{chapter.title}</span><small>{chapter.range}</small></button></li>)}</ol>
    </nav>}
    <div ref={scroller} className="jx-folio-scroll" tabIndex={0} role="region" aria-label={`${book.title}正文`}>
      <article className="jx-folio-text">
        <div className="jx-folio-head">
          <h2>{book.title}</h2>
          <p>{total ? `共 ${total} 次行动，分 ${chapters.length} 回` : '还没有完成的行动'}</p>
        </div>
        {book.opening && <section className="jx-folio-chapter jx-folio-prologue" aria-label="开场">
          {paragraphs(book.opening).map((line, index) => <p key={index}>{line}</p>)}
        </section>}
        {chapters.map(chapter => <section key={chapter.index} id={`jx-folio-${chapter.index}`} className="jx-folio-chapter" aria-labelledby={`jx-folio-${chapter.index}-title`}>
          <h3 id={`jx-folio-${chapter.index}-title`}>{chapter.title}<small>{chapter.range}</small></h3>
          {chapter.turns.map(turn => <Fragment key={turn.key}>
            <p className="jx-zhupi"><span className="jx-visually-hidden">你的行动：</span>{turn.action}</p>
            {turn.parts.map((part, partIndex) => part.speaker
              ? <div key={partIndex} className="jx-folio-voice" style={{ '--jx-speaker': `var(--jx-pigment-${part.pigment ?? 1})` } as CSSProperties}>
                {paragraphs(part.text).map((line, index) => <p key={index}>{index === 0 && <b className="jx-folio-speaker">{part.speaker}</b>}{line}</p>)}
              </div>
              : paragraphs(part.text).map((line, index) => <p key={`${partIndex}-${index}`}>{line}</p>))}
          </Fragment>)}
        </section>)}
      </article>
    </div>
  </dialog>;
}
