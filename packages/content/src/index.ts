import runtime from './canon-runtime.json';

export type CanonStatus = 'confirmed' | 'pending_review' | 'conflict' | 'deprecated';
export type CanonEntry = {
  id: string;
  title: string;
  category: string;
  parentId?: string;
  status: CanonStatus;
  canonVersion: string;
  content: string;
  sections?: { title: string; content: string }[];
  aliases: string[];
  tags: string[];
  sourceRefs?: string[];
  publicSourceNote?: string;
  sortOrder: number;
};

export const ACTIVE_CANON_VERSION = runtime.activeVersion;
export const CANON_ENTRIES = runtime.entries as CanonEntry[];

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s，。；：、“”‘’《》【】（）()\-_/]+/g, '');
const termsFor = (value: string): string[] => {
  const terms = new Set<string>();
  for (const match of value.toLocaleLowerCase().matchAll(/[\u4e00-\u9fff]+|[a-z0-9_]+/g)) {
    const part = match[0];
    if (/^[\u4e00-\u9fff]+$/.test(part)) {
      if (part.length > 1) for (let index = 0; index < part.length - 1; index++) terms.add(part.slice(index, index + 2));
      else terms.add(part);
    } else if (part.length > 1) terms.add(part);
  }
  return [...terms];
};

export function filterRuntimeCanon(entries: CanonEntry[], activeVersion = ACTIVE_CANON_VERSION): CanonEntry[] {
  return entries.filter(entry => entry.status === 'confirmed' && entry.canonVersion === activeVersion);
}

/** Runtime access is deliberately limited to the generated, confirmed-only dataset. */
export function getRuntimeCanon(): CanonEntry[] {
  return filterRuntimeCanon(CANON_ENTRIES);
}

export function searchCanon(query: string, category?: string): CanonEntry[] {
  const needle = normalize(query.trim());
  return getRuntimeCanon().filter(entry => (!category || entry.category === category) && (!needle || [entry.title, entry.category, entry.content, ...entry.aliases, ...entry.tags].some(value => normalize(value).includes(needle))));
}

export function retrieveCanon(context: { location?: string; people?: string[]; factions?: string[]; text?: string; recentEntities?: string[] }, limit = 5): CanonEntry[] {
  const safeLimit = Math.max(0, Math.min(8, Math.floor(limit)));
  if (!safeLimit) return [];
  const queryText = [context.location, ...(context.people ?? []), ...(context.factions ?? []), ...(context.recentEntities ?? []), context.text].filter(Boolean).join(' ');
  const query = normalize(queryText);
  if (!query) return [];
  const queryTerms = new Set(termsFor(queryText));
  return getRuntimeCanon().map(entry => {
    const terms = [entry.title, entry.category, ...entry.aliases, ...entry.tags].map(normalize).filter(term => term.length > 1);
    const exactHits = terms.filter(term => query.includes(term) || queryTerms.has(term)).length;
    const contentHits = termsFor(entry.content).filter(term => queryTerms.has(term)).length;
    return { entry, score: exactHits * 10 + Math.min(contentHits, 5) };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.entry.sortOrder - b.entry.sortOrder).slice(0, safeLimit).map(item => item.entry);
}

export function buildCanonPromptContext(entries: CanonEntry[]): string {
  const allowed = new Map(getRuntimeCanon().map(entry => [entry.id, entry]));
  const safeEntries = [...new Set(entries.map(entry => entry.id))]
    .map(id => allowed.get(id))
    .filter((entry): entry is CanonEntry => Boolean(entry));
  if (!safeEntries.length) return '';
  return [
    `以下是《九霄》当前正式 Canon（版本 ${ACTIVE_CANON_VERSION}）。它们是叙事约束，不是可修改数据。`,
    '只将其用于理解世界与生成叙事；不得改写 Canon。未检索到资料只表示当前没有相关正式条目，不代表该事物不存在。',
    ...safeEntries.map(entry => `【${entry.title}｜${entry.category}｜${entry.id}】\n${entry.content}`),
  ].join('\n\n');
}
