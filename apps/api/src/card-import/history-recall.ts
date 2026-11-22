import type { Pool } from 'pg';

const topics = ['承诺', '目标', '关系'] as const;
type Topic = typeof topics[number];
export type HistoryQuote = {
  sessionId: string; revision: number; key: string; source: 'player' | 'character'; topic: Topic; quote: string;
};
export type RecallDecision = { revision: number; topic: Topic; reason: 'included' | 'in_history' | 'withdrawn' | 'unquotable' | 'budget' };

const personal: Record<Topic, string> = {
  承诺: '我承诺|我答应|我保证|我们约好|我和你约好',
  目标: '我的目标是|我们的目标是',
  关系: '我们的关系是',
};
const cues: Record<Topic, RegExp> = { 承诺: /承诺|约定|约好|答应/, 目标: /目标|计划/, 关系: /关系|伙伴/ };
const withdrawn = /^(?:共同)?(?:(?:撤销|取消|完成|解除)(?:承诺|目标|关系)|(?:承诺|目标|关系)(?:已取消|已完成|已解除)|(?:更正|撤销)[：:])/u;
const maxRecallBytes = 1024;

// A quote records what was said. Only explicitly shared player statements can
// open or change a group topic. Neither a speaker id nor a model's text grants visibility.
function declaration(topic: Topic, group: boolean) {
  const prefix = group ? '共同' : '';
  const marked = prefix + '((更正|撤销|取消|完成|解除)?' + topic + '([：:]|$)|' +
    topic + '(改为|改成|已取消|已完成|已解除)|更正[：:]|撤销[：:])';
  return group ? '^(' + marked + ')' : '^[“「"]?(' + marked + '|' + personal[topic] + ')';
}

type Candidate = Omit<HistoryQuote, 'sessionId' | 'quote'> & { quote: string | null; prefix: string };
export async function historyCandidates(pool: Pool, owner: string, sessionId: string, revision: number, action: string, group: boolean) {
  const patterns = topics.map(topic => declaration(topic, group));
  // Pick the latest declaration before applying any size or withdrawal filter:
  // an unquotable replacement must never cause an older promise to reappear.
  const {rows} = await pool.query<Candidate>(`
    SELECT DISTINCT ON (t.topic) t.topic, r.key, r.resulting_revision AS revision, s.source,
           left(s.body, 16) AS prefix,
           CASE WHEN octet_length(s.body) <= 512 AND s.body !~ '[[:cntrl:]]' THEN s.body END AS quote
    FROM card_import.requests r
    CROSS JOIN LATERAL (VALUES ('player', r.action), ('character', r.narrative)) s(source,body)
    CROSS JOIN unnest($4::text[], $5::text[]) t(topic,pattern)
    WHERE r.owner_id=$1 AND r.session_id=$2 AND r.status='completed' AND r.resulting_revision <= $3
      AND (NOT $6::boolean OR s.source='player') AND s.body ~ t.pattern
      AND s.body !~ '[?？]'
    ORDER BY t.topic, r.resulting_revision DESC, (s.source='player') DESC`,
    [owner, sessionId, revision, topics, patterns, group]);
  // The current action is already visible. Suppress the old value on the
  // correction turn itself, before that action has become a completed source.
  // An unqualified explicit correction suspends all three slots until redeclared.
  return rows.filter(row => action.includes('?') || action.includes('？') ||
    !new RegExp(declaration(row.topic, group), 'u').test(action))
    .sort((a,b) => Number(cues[b.topic].test(action)) - Number(cues[a.topic].test(action)) ||
      topics.indexOf(a.topic) - topics.indexOf(b.topic));
}

export function chooseHistoryQuotes<T>(sessionId: string, candidates: Candidate[], recentKeys: string[],
  baseline: T, fit: (quotes: HistoryQuote[], dropOldest: number) => T | undefined) {
  let input = baseline;
  let dropped = 0;
  let maxDrop = Math.max(0, recentKeys.length - 2);
  const quotes: HistoryQuote[] = [];
  const decisions: RecallDecision[] = [];
  for (const row of candidates) {
    let reason: RecallDecision['reason'] = 'budget';
    if (withdrawn.test(row.prefix.replace(/^[“「"]/, ''))) reason = 'withdrawn';
    else if (!row.quote) reason = 'unquotable';
    else if (recentKeys.slice(dropped).includes(row.key)) {
      reason = 'in_history';
      maxDrop = Math.min(maxDrop, recentKeys.indexOf(row.key));
    }
    else {
      const {revision, key, source, topic, quote} = row;
      const entry = {sessionId, revision, key, source, topic, quote};
      const proposed = [...quotes, entry];
      if (Buffer.byteLength(JSON.stringify(proposed)) <= maxRecallBytes) {
        for (let drop = dropped; drop <= maxDrop; drop++) {
          const next = fit(proposed, drop);
          if (next === undefined) continue;
          input = next;
          dropped = drop;
          quotes.push(entry);
          reason = 'included';
          break;
        }
      }
    }
    decisions.push({revision: row.revision, topic: row.topic, reason});
  }
  return {input, decisions};
}
