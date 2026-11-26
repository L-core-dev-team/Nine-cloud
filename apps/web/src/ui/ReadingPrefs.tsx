import { useEffect, useRef, useState } from 'react';

/**
 * 阅读偏好 (01-设计总纲 §5.4). Stored only in this browser under jx_reading_prefs_v1;
 * never written to a save, never uploaded. Every storage access is guarded.
 */
export type ReadingPrefs = {
  size: '16' | '17' | '18' | '20' | '22';
  leading: 'compact' | 'standard' | 'loose';
  measure: 'narrow' | 'standard' | 'wide';
  theme: 'night' | 'soft' | 'paper';
  font: 'song' | 'kai';
  paragraph: 'play' | 'book';
};

const KEY = 'jx_reading_prefs_v1';
export const DEFAULT_READING_PREFS: ReadingPrefs = { size: '18', leading: 'standard', measure: 'standard', theme: 'night', font: 'song', paragraph: 'play' };

const OPTIONS: { [K in keyof ReadingPrefs]: { label: string; values: [ReadingPrefs[K], string][] } } = {
  size: { label: '字号', values: [['16', '16'], ['17', '17'], ['18', '18'], ['20', '20'], ['22', '22']] },
  leading: { label: '行距', values: [['compact', '紧凑'], ['standard', '标准'], ['loose', '宽松']] },
  measure: { label: '行宽', values: [['narrow', '窄'], ['standard', '标准'], ['wide', '宽']] },
  theme: { label: '纸面', values: [['night', '随主题'], ['soft', '柔和'], ['paper', '宣纸']] },
  font: { label: '字体', values: [['song', '宋'], ['kai', '楷']] },
  paragraph: { label: '段落', values: [['play', '游玩式'], ['book', '书籍式']] },
};

function sanitize(value: unknown): ReadingPrefs {
  const result = { ...DEFAULT_READING_PREFS };
  if (typeof value !== 'object' || value === null) return result;
  for (const key of Object.keys(OPTIONS) as (keyof ReadingPrefs)[]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (OPTIONS[key].values.some(([option]) => option === candidate)) (result as Record<string, string>)[key] = candidate as string;
  }
  return result;
}

export function useReadingPrefs(): [ReadingPrefs, (next: ReadingPrefs) => void] {
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return DEFAULT_READING_PREFS; }
  });
  const update = (next: ReadingPrefs) => {
    setPrefs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Preference applies to this view only. */ }
  };
  return [prefs, update];
}

/** Data attributes applied to the shell so story-e.css can map them to reading tokens. */
export function readingPrefAttributes(prefs: ReadingPrefs): Record<string, string> {
  return {
    'data-jx-size': prefs.size, 'data-jx-leading': prefs.leading, 'data-jx-measure': prefs.measure,
    'data-jx-reading-theme': prefs.theme, 'data-jx-reading-font': prefs.font, 'data-jx-paragraph': prefs.paragraph,
  };
}

export function ReadingPrefsDialog({ prefs, onChange, onClose }: { prefs: ReadingPrefs; onChange: (next: ReadingPrefs) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => { if (element.open) element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="jx-reading-prefs" aria-labelledby="jx-reading-prefs-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="jx-reading-prefs-head"><h2 id="jx-reading-prefs-title">阅读设置</h2><button type="button" aria-label="关闭阅读设置" onClick={onClose}>×</button></div>
    <div className="jx-reading-prefs-body">
      {(Object.keys(OPTIONS) as (keyof ReadingPrefs)[]).map(key => <fieldset key={key}>
        <legend>{OPTIONS[key].label}</legend>
        <div className="jx-segmented">
          {OPTIONS[key].values.map(([value, label]) => <label key={value}>
            <input type="radio" name={`jx-reading-${key}`} value={value} checked={prefs[key] === value} onChange={() => onChange({ ...prefs, [key]: value })} />{label}
          </label>)}
        </div>
      </fieldset>)}
      <p className="jx-reading-prefs-note">只保存在这台设备上，不写入存档。“楷”使用系统楷体。</p>
    </div>
  </dialog>;
}
