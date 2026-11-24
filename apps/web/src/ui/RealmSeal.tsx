import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { REALM_ORDER } from '@jiuxiao/content/realm-order';
import { realmGlyph, realmPercent, type RealmStatus } from './realm';
import './realm-e.css';

/**
 * 境界铭牌 · 玉璧 (JX-UI-E-01, third pass).
 *
 * 苍璧礼天: the bi disc stands for heaven, which is what 九霄 is about. The band of the disc
 * fills with cultivation progress, twelve ticks mark the 周天, and the hole carries the
 * realm's character. Purely a view of authoritative save facts (see ./realm.ts).
 */
export function RealmSeal({ status, size = 'sm' }: { status: RealmStatus; size?: 'sm' | 'lg' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const filled = Math.max(0, Math.min(100, status.progress * 100));
  return <span className={`jx-bi jx-bi--${size}`} data-perfected={status.perfected ? 'true' : undefined} aria-hidden="true">
    <svg viewBox="0 0 48 48" focusable="false">
      <defs>
        <radialGradient id={`${id}-jade`} cx="38%" cy="32%" r="78%">
          <stop offset="0" stopColor="var(--bi-jade-light)" />
          <stop offset="0.62" stopColor="var(--bi-jade)" />
          <stop offset="1" stopColor="var(--bi-jade-deep)" />
        </radialGradient>
        <linearGradient id={`${id}-flow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--bi-flow-start)" />
          <stop offset="1" stopColor="var(--bi-flow-end)" />
        </linearGradient>
      </defs>
      <circle className="jx-bi-body" cx="24" cy="24" r="22.5" fill={`url(#${id}-jade)`} />
      <g className="jx-bi-ticks">
        {Array.from({ length: 12 }, (_, index) => <line key={index} x1="24" y1="2.6" x2="24" y2={index % 3 === 0 ? 5.6 : 4.4} transform={`rotate(${index * 30} 24 24)`} />)}
      </g>
      <circle className="jx-bi-track" cx="24" cy="24" r="15" pathLength={100} />
      <circle className="jx-bi-flow" cx="24" cy="24" r="15" pathLength={100} stroke={`url(#${id}-flow)`} strokeDasharray={`${filled} 100`} transform="rotate(-90 24 24)" />
      <circle className="jx-bi-hole" cx="24" cy="24" r="9" />
    </svg>
    <span className="jx-bi-glyph">{realmGlyph(status.realm)}</span>
  </span>;
}

/** Header plaque: the seal plus the realm name; announces cultivation gains politely. */
export function RealmPlaque({ status, onOpen }: { status: RealmStatus; onOpen: () => void }) {
  const previous = useRef<number | null>(null);
  const [surge, setSurge] = useState<{ gain: number; key: number } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = status.raw;
    if (before === null || status.raw <= before) return;
    setSurge({ gain: status.raw - before, key: Date.now() });
    const timer = window.setTimeout(() => setSurge(null), 1800);
    return () => window.clearTimeout(timer);
  }, [status.raw]);
  const percent = realmPercent(status);
  return <>
    <button type="button" className="jx-realm" data-surge={surge ? 'true' : undefined} key={surge?.key} onClick={onOpen}
      aria-label={`境界：${status.realm}期，${status.perfected ? '已圆满' : `修为 ${percent}%`}。查看境界图`}>
      <RealmSeal status={status} />
      <span className="jx-realm-text"><strong>{status.realm}期</strong><small>{status.perfected ? '圆满' : `修为 ${percent}%`}</small></span>
    </button>
    <span className="jx-visually-hidden" aria-live="polite">{surge ? `修为增加 ${surge.gain}，现为 ${percent}%。` : ''}</span>
  </>;
}

type CanonSection = { title: string; content: string };

/** Canon sections use “• 标题： ○ 甲 ○ 乙” bullets; join the ○ items after their heading. Text is not rewritten. */
export function canonParagraphs(content: string): string[] {
  return content.split(/\s*•\s*/).map(part => part.trim()).filter(Boolean).map(part => {
    const [head = '', ...items] = part.split(/\s*○\s*/);
    const joined = items.map(item => item.trim()).filter(Boolean).reduce((text, item) => text + (!text || /[。！？；]$/.test(text) ? '' : '；') + item, '');
    return items.length ? `${head.trim()}${joined}` : head.trim();
  });
}

/** 境界图: nine heavens, the current one at the bottom; Canon text for where the player stands. */
export function RealmChart({ status }: { status: RealmStatus }) {
  const [canon, setCanon] = useState<CanonSection | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    import('@jiuxiao/content/worldbook').then(module => {
      const entry = module.canonRuntimeEntries.find(item => item.title === '修炼境界介绍');
      const section = entry?.sections?.find(item => item.title === `${status.realm}期`);
      if (alive) setCanon(section ? { title: section.title, content: section.content } : null);
    }).catch(() => { if (alive) setCanon(null); });
    return () => { alive = false; };
  }, [status.realm]);
  const remaining = status.max - status.raw;
  return <div className="jx-realm-chart">
    <ol className="jx-realm-ladder" aria-label="九境，自下而上">
      {REALM_ORDER.map((name, index) => <li key={name} data-state={index < status.index ? 'past' : index === status.index ? 'current' : 'ahead'} style={{ '--rung': index } as CSSProperties}>
        <span className="jx-realm-rung-name">{name}期</span>
        {index === status.index && <span className="jx-realm-rung-now">此刻所在</span>}
      </li>)}
    </ol>
    <div className="jx-realm-detail">
      <div className="jx-realm-figure">
        <RealmSeal status={status} size="lg" />
        <div>
          <p className="jx-realm-name">{status.realm}期{status.perfected ? '圆满' : ''}</p>
          <p className="jx-realm-numbers">修为 {status.raw.toLocaleString('zh-CN')} / {status.max.toLocaleString('zh-CN')}</p>
        </div>
      </div>
      <p className="jx-realm-note">{status.perfected ? '修为已至炼体期圆满。' : `距炼体期圆满还差 ${remaining.toLocaleString('zh-CN')}。每修炼一刻消耗体力 20、增加修为 800；剩余体力不足一刻时，最后一刻只增加 200，并记一次疲劳。`}序章不开放突破，圆满之后的路要等后续规则开放。</p>
      {canon === 'loading' ? <p className="jx-realm-note">正在读取世界设定……</p> : canon ? <section className="jx-realm-canon" aria-label={`世界设定：${canon.title}`}>
        <h3>{canon.title}</h3>
        {canonParagraphs(canon.content).map((part, index) => <p key={index}>{part}</p>)}
        <p className="jx-realm-source">出自世界设定《修炼境界介绍》（Canon 1.0，已确认）。</p>
      </section> : <p className="jx-realm-note">世界设定暂时无法读取。</p>}
    </div>
  </div>;
}
