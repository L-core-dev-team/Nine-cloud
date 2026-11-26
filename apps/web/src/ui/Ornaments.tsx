import type { CSSProperties, ReactNode } from 'react';

/**
 * JX-UI-E-01 signature ornaments. Presentation only: no network, no storage.
 * See docs/design/JX-UI-E-01/01-设计总纲.md §3.
 */

const TICKS = Array.from({ length: 36 }, (_, index) => index * 10);
const STARS: [number, number, number][] = [
  [200 + 180 * Math.cos(-0.9), 200 + 180 * Math.sin(-0.9), 1200],
  [96, 262, 1320],
  [318, 286, 1440],
];

/** 浑天环: thin armillary rings with graduations. Decorative; hidden from assistive technology. */
export function ArmillaryRing({ className, draw = false, compact = false }: { className?: string; draw?: boolean; compact?: boolean }) {
  return <svg className={['jx-armillary', draw ? 'jx-armillary--draw' : '', compact ? 'jx-armillary--compact' : '', className].filter(Boolean).join(' ')} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
    <circle className="jx-armillary-ring" cx="200" cy="200" r="180" pathLength={1} strokeWidth="1.2" strokeOpacity="0.62" />
    <ellipse className="jx-armillary-ring" cx="200" cy="200" rx="180" ry="58" transform="rotate(-18 200 200)" pathLength={1} strokeWidth="1" strokeOpacity="0.5" style={{ animationDelay: '120ms' }} />
    {!compact && <ellipse className="jx-armillary-ring" cx="200" cy="200" rx="168" ry="104" transform="rotate(34 200 200)" pathLength={1} strokeWidth="0.9" strokeOpacity="0.42" style={{ animationDelay: '240ms' }} />}
    {!compact && <circle className="jx-armillary-ring" cx="200" cy="200" r="128" pathLength={1} strokeWidth="0.75" strokeOpacity="0.3" style={{ animationDelay: '360ms' }} />}
    <g className="jx-armillary-ticks">
      {TICKS.map(degree => {
        const radians = degree * Math.PI / 180;
        const long = degree % 30 === 0;
        const inner = long ? 168 : 174;
        return <line key={degree} x1={200 + Math.cos(radians) * 180} y1={200 + Math.sin(radians) * 180} x2={200 + Math.cos(radians) * inner} y2={200 + Math.sin(radians) * inner} strokeWidth={long ? 1 : 0.7} strokeOpacity={long ? 0.6 : 0.4} />;
      })}
    </g>
    {!compact && STARS.map(([x, y, delay]) => <circle key={delay} className="jx-armillary-star" cx={x} cy={y} r="2.4" style={{ animationDelay: `${delay}ms` }} />)}
  </svg>;
}

/** 朱印: brand seal. Text is drawn with CSS so it never enters innerText or the accessibility tree. */
export function Seal({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <span className={['jx-seal', `jx-seal--${size}`, className].filter(Boolean).join(' ')} aria-hidden="true" />;
}

/** Deterministic pigment index (1–8) for a name; used for monograms and speaker marks. */
export function pigmentIndex(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619) >>> 0;
  return (hash % 8) + 1;
}

/** 首字占位: first character over a pigment ink wash. No external asset. */
export function Monogram({ name, className, index }: { name: string; className?: string; index?: number }) {
  const label = name.trim() || '未';
  const pigment = index ?? pigmentIndex(label);
  return <span className={['jx-monogram', className].filter(Boolean).join(' ')} style={{ '--jx-monogram-pigment': `var(--jx-pigment-${pigment})` } as CSSProperties} aria-hidden="true">
    <span>{Array.from(label)[0]}</span>
  </span>;
}

/** 月洞门: circular framed scene used for lobby destinations. */
export function MoonGate({ image, children, className }: { image: string; children?: ReactNode; className?: string }) {
  return <span className={['jx-moongate', className].filter(Boolean).join(' ')} aria-hidden="true">
    <span className="jx-moongate-view" style={{ backgroundImage: `url("${image}")` }} />
    {children}
  </span>;
}
