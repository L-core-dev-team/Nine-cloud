import type { LocalSave } from '../storage';

/**
 * Picks the save the player most likely wants to resume: the active save of this
 * tab when it still exists, otherwise the most recently updated one.
 * Read-only presentation helper; it never writes storage.
 */
export function pickResumeSave(saves: LocalSave[]): LocalSave | undefined {
  let activeSaveId = '';
  try { activeSaveId = sessionStorage.getItem('jiuxiao_active_save_id') || ''; } catch { /* Optional preference. */ }
  const active = saves.find(item => item.saveId === activeSaveId);
  if (active) return active;
  let latest: LocalSave | undefined;
  for (const save of saves) {
    if (!latest || Date.parse(save.updatedAt) > Date.parse(latest.updatedAt)) latest = save;
  }
  return latest ?? saves[0];
}

const RELATIVE = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

/** Relative time in Chinese ("2 小时前"); empty string when the timestamp is unusable. */
export function relativeTime(iso: string | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const seconds = Math.round((at - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return '刚刚';
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return RELATIVE.format(Math.round(seconds / 86400), 'day');
  return new Date(at).toLocaleDateString('zh-CN');
}
