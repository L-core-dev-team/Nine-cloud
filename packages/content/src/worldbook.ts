import canonRuntime from './canon-runtime.json' with { type: 'json' };

export type CanonRuntimeSection = {
  title: string;
  content: string;
};

export type CanonRuntimeEntry = {
  id: string;
  title: string;
  category: string;
  status: 'confirmed';
  canonVersion: string;
  content: string;
  sections?: readonly CanonRuntimeSection[];
  aliases?: readonly string[];
  tags?: readonly string[];
  origin?: string;
  publicSourceNote?: string;
  sortOrder: number;
  parentId?: string;
};

type CanonRuntime = {
  schemaVersion: number;
  activeVersion: string;
  entries: readonly CanonRuntimeEntry[];
};

const publicRuntimeKeys = new Set([
  'id', 'title', 'category', 'status', 'canonVersion', 'content', 'sections',
  'aliases', 'tags', 'origin', 'publicSourceNote', 'sortOrder', 'parentId',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateCanonRuntime(value: unknown): CanonRuntime {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.activeVersion !== 'string'
    || !value.activeVersion.trim() || !Array.isArray(value.entries)) {
    throw new Error('Invalid public Canon runtime manifest');
  }

  const activeVersion = value.activeVersion;
  const ids = new Set<string>();
  const entries = value.entries.map((rawEntry): CanonRuntimeEntry => {
    if (!isRecord(rawEntry) || Object.keys(rawEntry).some(key => !publicRuntimeKeys.has(key))) {
      throw new Error('Canon runtime contains an invalid or non-public field');
    }
    const entry = rawEntry as unknown as CanonRuntimeEntry;
    if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id)
      || typeof entry.title !== 'string' || !entry.title.trim()
      || typeof entry.category !== 'string' || !entry.category.trim()
      || entry.status !== 'confirmed' || entry.canonVersion !== activeVersion
      || typeof entry.content !== 'string' || !entry.content.trim()
      || !Number.isSafeInteger(entry.sortOrder)) {
      throw new Error(`Invalid public Canon entry: ${String(rawEntry.id ?? '')}`);
    }
    if (entry.sections !== undefined && (!Array.isArray(entry.sections)
      || entry.sections.some(section => !isRecord(section)
        || Object.keys(section).some(key => key !== 'title' && key !== 'content')
        || typeof section.title !== 'string' || typeof section.content !== 'string'))) {
      throw new Error(`Invalid public Canon sections: ${entry.id}`);
    }
    for (const list of [entry.aliases, entry.tags]) {
      if (list !== undefined && (!Array.isArray(list) || list.some(item => typeof item !== 'string'))) {
        throw new Error(`Invalid public Canon search terms: ${entry.id}`);
      }
    }
    if (entry.publicSourceNote !== undefined && typeof entry.publicSourceNote !== 'string') {
      throw new Error(`Invalid public Canon source note: ${entry.id}`);
    }
    ids.add(entry.id);
    return entry;
  });

  return {
    schemaVersion: value.schemaVersion,
    activeVersion,
    entries: entries.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

const publicCanon = validateCanonRuntime(canonRuntime);

/** Only entries in the generated public runtime are exposed to player search. */
export const canonRuntimeEntries: readonly CanonRuntimeEntry[] = publicCanon.entries;

const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-CN')
  .replace(/[\s\p{P}\p{S}]+/gu, '');

export function searchCanonRuntime(query: string): CanonRuntimeEntry[] {
  const needle = fold(query.trim());
  if (!needle) return [...canonRuntimeEntries];
  return canonRuntimeEntries.filter(entry => fold([
    entry.title,
    entry.content,
    ...(entry.sections ?? []).flatMap(section => [section.title, section.content]),
    ...(entry.aliases ?? []),
    ...(entry.tags ?? []),
  ].join(' ')).includes(needle));
}

export function getCanonRuntimeEntry(id: string): CanonRuntimeEntry | undefined {
  return canonRuntimeEntries.find(entry => entry.id === id);
}
