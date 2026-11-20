// Pure policy evaluation. This module has no database, filesystem or cleanup capability.
export const policy = 'JX-M3-DATA-POLICY-01/V1.0';
const day = 86_400_000;
export function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw Error('INVALID_TIME');
  return Date.parse(value);
}
function sixMonths(time) {
  const date = new Date(time);
  const dom = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 6);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(dom, end.getUTCDate()));
  return date.getTime();
}

// Trusted policy review input. "none" for an inapplicable cloud/owner deletion must be explicit.
export function assessRetention(record, control, now) {
  try {
    const clock = instant(now);
    if (control.reconciled !== true || control.pendingRemote !== false || control.staleBackupRisk !== false ||
        !Array.isArray(control.holds)) return 'HOLD';
    // An expired review deadline prompts review; it cannot expire a hold.
    if (control.holds.length) return 'HOLD';
    const observed = x => {
      const t = instant(x);
      if (t > clock) throw Error('FUTURE');
      return t;
    };
    let due;
    switch (record.kind) {
      case 'security-log':
        return clock < sixMonths(observed(record.occurredAt)) ? 'RETAIN' : 'LEGAL_REVIEW_REQUIRED';
      case 'backup': due = observed(record.completedAt) + 30 * day; break;
      case 'audit':
        due = sixMonths(Math.max(observed(record.localCompletedAt),
          record.remoteCompletedAt === 'not-applicable' ? 0 : observed(record.remoteCompletedAt))); break;
      case 'allowance':
        due = sixMonths(Math.max(observed(record.closedAt), observed(record.lastChangeAt),
          record.accountDeletedAt === 'not-applicable' ? 0 : observed(record.accountDeletedAt))); break;
      default: return 'HOLD';
    }
    if (clock < due) return 'RETAIN';
    return record.kind === 'backup' ? 'DISPOSAL_REVIEW_OR_QUARANTINE' : 'INDEPENDENT_REVIEW_AND_OWNER_BATCH_APPROVAL_REQUIRED';
  } catch { return 'HOLD'; }
}
export function pendingRemoteReview(firstPendingAt, now) {
  try {
    const age = instant(now) - instant(firstPendingAt);
    if (age >= 0 && age <= 7 * day) return 'RETAIN_PENDING';
  } catch { /* Missing trustworthy clock is itself a reason to review. */ }
  return 'RETAIN_AND_ESCALATE';
}
