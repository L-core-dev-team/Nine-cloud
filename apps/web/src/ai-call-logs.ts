export type CallLog = {
  at: string; role: string; model: string; elapsedMs: number; outcome: 'success' | 'failure';
  status?: number; inputTokens?: number; outputTokens?: number; errorCode?: string;
};

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Rebuild the public metadata whitelist; never persist an untrusted log object. */
export function sanitizeCallLogs(values: unknown, retentionDays: number, now = Date.now()): CallLog[] {
  if (!Array.isArray(values) || !Number.isFinite(now) || !Number.isInteger(retentionDays)
    || retentionDays <= 0 || retentionDays > 90) return [];
  const cutoff = now - retentionDays * 86_400_000;
  const logs: CallLog[] = [];
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const raw = value as Record<string, unknown>;
    const timestamp = typeof raw.at === 'string' ? Date.parse(raw.at) : NaN;
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now
      || typeof raw.role !== 'string' || typeof raw.model !== 'string'
      || !count(raw.elapsedMs) || (raw.outcome !== 'success' && raw.outcome !== 'failure')) continue;
    const log: CallLog = { at: new Date(timestamp).toISOString(), role: raw.role,
      model: raw.model, elapsedMs: raw.elapsedMs, outcome: raw.outcome };
    if (count(raw.status) && raw.status >= 100 && raw.status <= 599) log.status = raw.status;
    if (count(raw.inputTokens)) log.inputTokens = raw.inputTokens;
    if (count(raw.outputTokens)) log.outputTokens = raw.outputTokens;
    if (typeof raw.errorCode === 'string' && /^(TIMEOUT|NETWORK_OR_FORMAT|HTTP_[1-5]\d{2})$/.test(raw.errorCode)) {
      log.errorCode = raw.errorCode;
    }
    logs.push(log);
  }
  return logs.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-200);
}
