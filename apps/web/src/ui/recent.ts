/**
 * 本机最近打开 (D-5): a per-device list of recently opened sessions.
 * Presentation-only. Key `jx_recent_v1` in localStorage; never part of a save,
 * never uploaded. Every access is guarded: failures simply hide the list.
 */
export type RecentEntry = { kind: 'game' | 'card'; id: string; label: string; openedAt: string };

const KEY = 'jx_recent_v1';
const LIMIT = 8;

export function readRecent(): RecentEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentEntry => typeof item === 'object' && item !== null
      && (item.kind === 'game' || item.kind === 'card') && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.openedAt === 'string').slice(0, LIMIT);
  } catch { return null; }
}

export function recordRecent(entry: Omit<RecentEntry, 'openedAt'>): void {
  try {
    const current = readRecent() ?? [];
    const next = [{ ...entry, openedAt: new Date().toISOString() }, ...current.filter(item => !(item.kind === entry.kind && item.id === entry.id))].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* Optional convenience; never blocks navigation. */ }
}

export function recentPath(entry: RecentEntry): string {
  return entry.kind === 'game' ? `/game/${entry.id}` : `/cards/session/${encodeURIComponent(entry.id)}`;
}
