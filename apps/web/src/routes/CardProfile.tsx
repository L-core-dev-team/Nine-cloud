import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CardItem, ImportItem, SessionItem } from '../card-import-client';
import { CardPortrait } from '../ui/CardPortrait';
import { pigmentIndex } from '../ui/Ornaments';
import './liezhuan-e.css';

/**
 * P04 人物志 · 列传版式 (JX-UI-E-01).
 *
 * A saved card is read like a 线装书: the portrait is the cover, the name sits on a
 * 题签 (the paper slip pasted on a book cover), and the card fields follow as the
 * chapters of a biography. Everything here is display only — the text is the
 * card's own text; placeholders such as {{char}} are marked, never substituted,
 * because the session context does not substitute them either. Editing, export,
 * deletion and session creation reuse the library's existing handlers.
 */

type Doc = Record<string, unknown>;
const record = (value: unknown): Doc | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Doc : undefined;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function cardData(card: CardItem): Doc | undefined {
  const doc = record(card.parsed?.document);
  return record(doc?.data) ?? doc;
}

const MACRO = /(\{\{(?:char|user)\}\})/gi;
const ASIDE = /(\*[^*\n]{1,400}\*)/g;

/** Inline text: card placeholders become small marked tokens; *actions* stay visible but recede. */
function Inline({ text }: { text: string }) {
  return <>{text.split(MACRO).map((part, index) => {
    if (index % 2 === 1) {
      const user = part.toLowerCase() === '{{user}}';
      return <span key={index} className="jx-macro" data-role={user ? 'user' : 'char'} title={user ? '会话中由玩家身份代入' : '指本角色'}>{part}</span>;
    }
    return <Fragment key={index}>{part.split(ASIDE).map((piece, at) => at % 2 === 1 ? <span key={at} className="jx-aside">{piece}</span> : piece)}</Fragment>;
  })}</>;
}

function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  return <div className="jx-lz-prose">{paragraphs.map((paragraph, index) => <p key={index}><Inline text={paragraph} /></p>)}</div>;
}

type Line = { kind: 'break' } | { kind: 'speech'; speaker: string; text: string } | { kind: 'note'; text: string };
const SPEAKER = /^\s*(\{\{(?:char|user)\}\}|[^:：\s<>*][^:：<>*\n]{0,23})\s*[:：]\s?(.*)$/i;

/** 示例对白: split into speaker lines for display only; anything unrecognised is shown verbatim. */
export function dialogueLines(text: string): Line[] | null {
  const lines: Line[] = [];
  let speeches = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (/^\s*<start>\s*$/i.test(raw)) { if (lines.length && lines.at(-1)?.kind !== 'break') lines.push({ kind: 'break' }); continue; }
    const match = SPEAKER.exec(raw);
    if (match) { speeches += 1; lines.push({ kind: 'speech', speaker: match[1]!, text: match[2] ?? '' }); }
    else lines.push({ kind: 'note', text: raw.trim() });
  }
  return speeches >= 2 ? lines : null;
}

/** Speaker column only: {{char}} reads as the card's name and {{user}} as 你; the text itself is untouched. */
const speakerLabel = (speaker: string, name: string) => speaker.toLowerCase() === '{{char}}' ? name : speaker.toLowerCase() === '{{user}}' ? '你' : speaker;

function Dialogue({ text, name }: { text: string; name: string }) {
  const lines = dialogueLines(text);
  if (!lines) return <Prose text={text} />;
  const tone = (speaker: string) => speaker.toLowerCase() === '{{user}}' ? 8 : pigmentIndex(speaker.toLowerCase() === '{{char}}' ? name : speaker);
  return <div className="jx-lz-dialogue">{lines.map((line, index) => line.kind === 'break'
    ? <hr key={index} className="jx-lz-scene-break" />
    : line.kind === 'note'
      ? <p key={index} className="jx-lz-note"><Inline text={line.text} /></p>
      : <p key={index} className="jx-lz-speech" style={{ '--jx-speaker': `var(--jx-pigment-${tone(line.speaker)})` } as CSSProperties}>
        <span className="jx-lz-speaker" title={/^\{\{(char|user)\}\}$/i.test(line.speaker) ? line.speaker : undefined}>{speakerLabel(line.speaker, name)}</span><span className="jx-lz-said"><Inline text={line.text} /></span>
      </p>)}</div>;
}

/**
 * 题签 characters, stacked one per line. Stacking is done with layout rather than
 * writing-mode so that fonts without vertical metrics still render; runs of Latin
 * letters and digits stay together and are turned sideways, as in vertical print.
 */
export function tiqianTokens(name: string): string[] {
  return name.match(/[\x21-\x7e]+(?:\s+[\x21-\x7e]+)*|\S/gu) ?? [];
}

/** 鱼尾: the fishtail mark printed in the centre fold of a block-printed page; here it opens each chapter. */
function Fishtail() {
  return <svg className="jx-fishtail" viewBox="0 0 16 10" aria-hidden="true"><path d="M0 0h16v6.2L8 2.6 0 6.2z" /><path d="M0 8.6l8-3.6 8 3.6V10H0z" opacity=".45" /></svg>;
}

type Chapter = { id: string; title: string; body: ReactNode };
type Props = {
  card: CardItem; name: string; cards: CardItem[]; imports: ImportItem[]; sessions: SessionItem[];
  load: (importId: string) => Promise<Uint8Array>; thumbnail?: ((importId: string) => Promise<Blob>) | undefined; busy: boolean; startBlocked?: boolean;
  onStart: (greetingIndex: number) => void; onDelete: () => void; onExport: (format: 'v2' | 'v3' | 'png') => void;
  revision: ReactNode; raw: ReactNode;
};

export function CardProfile({ card, name, cards, imports, sessions, load, thumbnail, busy, startBlocked, onStart, onDelete, onExport, revision, raw }: Props) {
  const data = cardData(card);
  const [greeting, setGreeting] = useState(-1);
  const body = useRef<HTMLDivElement>(null);
  const greetings = useMemo(() => {
    const list: { index: number; label: string; text: string }[] = [];
    if (str(data?.first_mes)) list.push({ index: -1, label: '原开场', text: str(data?.first_mes) });
    if (Array.isArray(data?.alternate_greetings)) data.alternate_greetings.forEach((value, index) => { if (str(value)) list.push({ index, label: `备用 ${index + 1}`, text: str(value) }); });
    return list;
  }, [data]);
  const shown = greetings.find(item => item.index === greeting) ?? greetings[0];
  const book = record(data?.character_book);
  const bookEntries = Array.isArray(book?.entries) ? book.entries.length : 0;
  const tags = Array.isArray(data?.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim()).slice(0, 12) : [];
  const creator = str(data?.creator), version = str(data?.character_version);
  const parent = card.parent_id ? cards.find(item => item.id === card.parent_id) : undefined;
  const sessionCount = sessions.filter(session => session.card_id === card.id).length;
  const linkText = card.metadata.links.length ? card.metadata.links.map(link => `${link.uri} (${imports.find(item => item.id === link.importId)?.filename || link.importId})`).join('、') : '无';
  const sourceFile = imports.find(item => item.id === card.import_id)?.filename;

  const chapters: Chapter[] = [];
  if (str(data?.description)) chapters.push({ id: 'description', title: '小传', body: <Prose text={str(data?.description)} /> });
  if (str(data?.personality)) chapters.push({ id: 'personality', title: '性格', body: <Prose text={str(data?.personality)} /> });
  if (str(data?.scenario)) chapters.push({ id: 'scenario', title: '背景', body: <Prose text={str(data?.scenario)} /> });
  if (shown) chapters.push({ id: 'greeting', title: '开场', body: <>
    {greetings.length > 1 && <div className="jx-lz-greetings" role="group" aria-label="选择开场">{greetings.map(item => <button key={item.index} type="button" aria-pressed={item.index === shown.index} onClick={() => setGreeting(item.index)}>{item.label}</button>)}</div>}
    <blockquote className="jx-lz-opening"><Prose text={shown.text} /></blockquote>
    <button type="button" className="secondary" disabled={busy || startBlocked} onClick={() => onStart(shown.index)}>以{shown.label}开始会话</button>
  </> });
  if (str(data?.mes_example)) chapters.push({ id: 'dialogue', title: '对白', body: <Dialogue text={str(data?.mes_example)} name={name} /> });
  if (str(data?.creator_notes)) chapters.push({ id: 'notes', title: '作者附记', body: <Prose text={str(data?.creator_notes)} /> });
  chapters.push({ id: 'book', title: '世界书', body: <>
    <p>{bookEntries ? `卡内附带世界书，共 ${bookEntries} 条。` : '卡内未附带世界书。'}</p>
    <p>关联资料：{linkText}</p>
  </> });
  chapters.push({ id: 'versions', title: '版本与来源', body: <dl className="jx-lz-facts">
    <div><dt>卡片</dt><dd>{card.id}</dd></div>
    <div><dt>版本</dt><dd>{card.parent_id ? `由 ${parent ? (parent.name || parent.id.slice(0, 8)) : card.parent_id.slice(0, 8)} 修订而来` : '初次保存的版本'}</dd></div>
    {sourceFile && <div><dt>原文件</dt><dd>{sourceFile}</dd></div>}
    {card.metadata.source && <div><dt>来源</dt><dd>{card.metadata.source}</dd></div>}
    {card.metadata.notes && <div><dt>备注</dt><dd className="jx-lz-pre">{card.metadata.notes}</dd></div>}
  </dl> });

  const reduce = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const jump = (id: string) => body.current?.querySelector(`#jx-lz-${id}`)?.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
  const revise = () => {
    const target = body.current?.querySelector<HTMLElement>('#jx-lz-revision');
    target?.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
    target?.querySelector<HTMLElement>('textarea')?.focus({ preventScroll: true });
  };
  const titleLength = Array.from(name).length;

  return <article className="jx-liezhuan" ref={body} aria-label={`${name}人物志`}>
    <div className="jx-lz-cover">
      <div className="jx-lz-portrait">
        <CardPortrait name={name} importId={card.import_id} load={load} thumbnail={thumbnail} skip={card.parsed?.format === 'json'} />
        <h3 className="jx-tiqian" data-length={titleLength > 9 ? 'long' : titleLength > 5 ? 'mid' : 'short'}>{titleLength > 9 ? name : tiqianTokens(name).map((token, index) => <span key={index} className={/^[\x21-\x7e\s]+$/.test(token) ? 'jx-tq-run' : undefined}>{token}</span>)}</h3>
      </div>
      <div className="jx-lz-colophon">
        <p className="jx-lz-byline">{[creator && `${creator} 撰`, version && `版本 ${version}`].filter(Boolean).join('，') || (card.parent_id ? '修订版' : '初版')}</p>
        {tags.length > 0 && <p className="jx-lz-tags">{tags.join('、')}</p>}
        <p className="jx-lz-count">{sessionCount ? `已有 ${sessionCount} 段会话` : '尚未开始会话'}</p>
        <div className="jx-lz-actions">
          <button type="button" className="primary" disabled={busy || startBlocked} onClick={() => onStart(shown?.index ?? -1)}>开始会话</button>
          <div className="jx-lz-tools">
            <button type="button" className="quiet-action" onClick={revise}>修订</button>
            <span className="jx-lz-export" role="group" aria-label="导出卡片">
              <span aria-hidden="true">导出</span>
              {(['v2', 'v3', 'png'] as const).map(format => <button key={format} type="button" className="quiet-action" disabled={busy} aria-label={`导出 ${format.toUpperCase()}`} onClick={() => onExport(format)}>{format.toUpperCase()}</button>)}
            </span>
            <button type="button" className="quiet-action jx-lz-danger" disabled={busy} onClick={onDelete}>删除</button>
          </div>
        </div>
      </div>
    </div>
    <nav className="jx-lz-index" aria-label="人物志目录">{chapters.map(chapter => <button key={chapter.id} type="button" onClick={() => jump(chapter.id)}>{chapter.title}</button>)}<button type="button" onClick={revise}>修订</button></nav>
    {chapters.map(chapter => <section key={chapter.id} id={`jx-lz-${chapter.id}`} className="jx-lz-chapter" aria-labelledby={`jx-lz-${chapter.id}-title`}>
      <h4 id={`jx-lz-${chapter.id}-title`}><Fishtail />{chapter.title}</h4>
      {chapter.body}
    </section>)}
    <section id="jx-lz-revision" className="jx-lz-chapter jx-lz-revision" aria-labelledby="jx-lz-revision-title">
      <h4 id="jx-lz-revision-title"><Fishtail />修订</h4>
      <p>编辑会创建新版本，原件与旧会话不变。</p>
      {revision}
      {raw}
    </section>
  </article>;
}
