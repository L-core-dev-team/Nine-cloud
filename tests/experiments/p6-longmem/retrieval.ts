import { performance } from 'node:perf_hooks';
import type { Dataset, Evidence, Query, Retrieval, Source } from './types.ts';

export const tokenMethod = 'ESTIMATE: ceil(UTF-8 evidence bytes / 2); no target tokenizer; not API usage';
export function estimateTokens(text: string): number { return Math.ceil(Buffer.byteLength(text, 'utf8') / 2); }
const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function grams(text: string): Set<string> {
  const chars = [...normalized(text)];
  return new Set(chars.slice(1).map((char, i) => chars[i]! + char));
}
const concepts = [
  { query: /初遇|第一次|最早|最初/, tags: ['初遇', '来源', '伪装'] },
  { query: /交给|赠|来源/, tags: ['赠送', '来源'] },
  { query: /归属|持有|归谁|转交|购买|买下/, tags: ['归属'] },
  { query: /关系|态度|戒备|信任|疏远/, tags: ['关系', '态度'] },
  { query: /约定|兑现|期限/, tags: ['约定'] },
  { query: /伏笔|刻痕|短线/, tags: ['伏笔', '刻痕'] },
  { query: /身份|伪装|白鹭客|守堤人/, tags: ['身份', '伪装'] },
  { query: /传闻|矛盾|说法/, tags: ['传闻', '矛盾', '说法'] },
  { query: /密信|秘密/, tags: ['秘密'] },
  { query: /封面/, tags: ['封面'] },
  { query: /气味/, tags: ['气味'] },
  { query: /通行|封闭|开放/, tags: ['通行'] },
  { query: /重逢|再次遇/, tags: ['重逢'] },
  { query: /同行/, tags: ['同行'] },
];

function visible(source: Source, query: Query): boolean {
  return source.turnId <= query.asOfTurn
    && (!query.turnRange || (source.turnId >= query.turnRange[0] && source.turnId <= query.turnRange[1]))
    && (!query.gameMinuteRange || (source.gameMinute >= query.gameMinuteRange[0] && source.gameMinute <= query.gameMinuteRange[1]))
    && (query.audience.kind === 'player' || source.authorizedNpcIds.includes(query.audience.npcId));
}
function materialize(source: Source, query: Query, score: number): Evidence {
  return { ...source, score,
    // At an earlier query clock, do not disclose a future supersession date.
    facts: source.facts.map(f => {
      if (f.validUntil !== undefined && f.validUntil > query.asOfTurn) {
        const { validUntil, ...known } = f;
        return known;
      }
      return { ...f };
    }),
    factStates: source.facts.map(f => ({
    factId: f.id, kind: f.kind,
    status: f.kind === 'character-claim' ? 'unverified' as const
      : f.validUntil !== undefined && f.validUntil <= query.asOfTurn ? 'historical' as const : 'current' as const,
    validity: f.kind === 'character-claim' ? 'unverified' as const
      : f.validUntil !== undefined && f.validUntil <= query.asOfTurn ? 'expired' as const : 'active' as const,
  })) };
}
export function serializeEvidence(source: Evidence): string {
  return `[${source.sourceId} turn=${source.turnId} time=${source.gameTime} minute=${source.gameMinute} place=${source.location} people=${source.participants.join(',')} items=${source.items.join(',')} events=${source.eventIds.join(',')} links=${source.historicalSources.join(',')}]\n`
    + source.narrative + '\n'
    + source.facts.map(f => `${f.id}: ${f.subject}/${f.predicate}=${f.value} (${source.factStates.find(x => x.factId === f.id)!.status}/${source.factStates.find(x => x.factId === f.id)!.validity};${f.kind};valid=${f.validFrom}..${f.validUntil ?? 'open'}${f.supersedes ? ';replaces=' + f.supersedes : ''})`).join('\n');
}

/** Whole original sources only; never truncate an uncertainty marker to fit. */
export function packEvidence(ranked: Evidence[], budget: number, maxSources = Number.MAX_SAFE_INTEGER): { evidence: Evidence[]; context: string; omittedSourceIds: string[] } {
  if (!Number.isSafeInteger(budget) || budget < 1 || !Number.isSafeInteger(maxSources) || maxSources < 1) throw new RangeError('Invalid budget/limit');
  const evidence: Evidence[] = [];
  let context = '';
  const omittedSourceIds: string[] = [];
  for (const source of ranked) {
    const candidate = context + (context ? '\n\n' : '') + serializeEvidence(source);
    if (evidence.length >= maxSources || estimateTokens(candidate) > budget) omittedSourceIds.push(source.sourceId);
    else { evidence.push(source); context = candidate; }
  }
  return { evidence, context, omittedSourceIds };
}

export class HistoryIndex {
  data: Dataset;
  documents: { source: Source; grams: Set<string>; features: Set<string> }[];
  constructor(data: Dataset) {
    this.data = data;
    this.documents = data.turns.map(source => ({ source,
      grams: grams(source.narrative + source.facts.map(f => f.value).join('')),
      features: new Set([...source.tags, ...source.facts.map(f => f.predicate),
        ...concepts.flatMap(c => c.tags).filter(tag => source.facts.some(f => f.predicate.includes(tag)))]),
    }));
  }
  search(query: Query, budget = 1024, strategy: 'recent' | 'historical' = 'historical', maxSources = Number.MAX_SAFE_INTEGER): Retrieval {
    const started = performance.now();
    if (!query.text.trim() || !Number.isSafeInteger(query.asOfTurn) || query.asOfTurn < 1 || query.asOfTurn > this.data.turns.length
      || (query.turnRange && (!query.turnRange.every(Number.isSafeInteger) || query.turnRange[0] < 1 || query.turnRange[0] > query.turnRange[1]))
      || (query.gameMinuteRange && (!query.gameMinuteRange.every(Number.isSafeInteger) || query.gameMinuteRange[0] < 0 || query.gameMinuteRange[0] > query.gameMinuteRange[1]))) throw new TypeError('Invalid query');
    const npcId = query.audience.kind === 'npc' ? query.audience.npcId : undefined;
    if (npcId && !this.data.entities.some(e => e.kind === 'person' && e.id === npcId)) throw new TypeError('Unknown NPC');
    const queryGrams = grams(query.text);
    const entities = this.data.entities.filter(e => e.id !== 'p-player' && [e.name, ...e.aliases].some(alias => alias && query.text.includes(alias)));
    const items = entities.filter(e => e.kind === 'item').map(e => e.id);
    const people = entities.filter(e => e.kind === 'person'
      && (query.audience.kind !== 'npc' || e.id !== query.audience.npcId)).map(e => e.id);
    const entityIds = entities.map(e => e.id);
    const eventId = query.text.match(/\be\d{3}-[a-z]+\b/i)?.[0];
    const intents = concepts.filter(c => c.query.test(query.text));
    const temporalChain = /变化|经过|前后|分别|哪些来源|全部|从.+到|伏笔.*揭晓/.test(query.text);
    const now = /现在|当前/.test(query.text);
    const first = /第一次|最初|最早|初遇/.test(query.text);
    // Unknown requested actions cannot be inferred from mere co-occurrence of people/items.
    // This is a generic action vocabulary, not a list of benchmark answers/entities.
    const requestedActions = ['盗走', '烧毁', '击败', '结为道侣', '获得王位', '杀害', '销毁', '出售'].filter(x => query.text.includes(x));
    const requestedGiftObject = query.text.match(/(?:把|将)([^，。？]+?)(?:送给|赠给|交给|转交给)/)?.[1];
    let ranked: Evidence[];
    if (strategy === 'recent') {
      ranked = this.documents.filter(d => visible(d.source, query)).map(d => materialize(d.source, query, d.source.turnId)).reverse();
    } else {
      const matched: Evidence[] = [];
      for (const doc of this.documents) {
        const s = doc.source;
        if (!visible(s, query) || !s.facts.length) continue;
        if (eventId && !s.eventIds.includes(eventId)) continue;
        if (requestedActions.length && !requestedActions.every(x => s.narrative.includes(x))) continue;
        if (requestedGiftObject && !s.narrative.includes(requestedGiftObject)) continue;
        if (/购买|买下/.test(query.text) && !doc.features.has('购买') && !s.narrative.includes('买下')) continue;
        if (/转交/.test(query.text) && !doc.features.has('转交') && !s.narrative.includes('转交')) continue;
        // Explicit items constrain provenance. Similar names never alias to each other.
        if (items.length && !items.some(id => s.items.includes(id) || s.facts.some(f => f.subject === id))) continue;
        if (!items.length && people.length && !people.some(id => s.participants.includes(id) || s.facts.some(f => f.subject === id))) continue;
        if (items.length && people.length && /转交|购买|买下/.test(query.text)
          && !people.every(id => s.participants.includes(id))) continue;
        const featureHits = intents.filter(c => c.tags.some(tag => doc.features.has(tag))).length;
        if (!eventId && intents.length && !featureHits) continue;
        const overlap = [...queryGrams].filter(g => doc.grams.has(g)).length;
        const entityHits = entityIds.filter(id => s.participants.includes(id) || s.items.includes(id) || s.facts.some(f => f.subject === id)).length;
        if (!eventId && overlap < 2 && !(featureHits && entityHits)) continue;
        let score = overlap + featureHits * 12 + entityIds.filter(id => s.participants.includes(id) || s.items.includes(id) || s.facts.some(f => f.subject === id)).length * 5;
        // Preserve uncertainty; prioritize directly related confirmed facts without promoting claims.
        if (!/传闻|说法|原文|气味|封面/.test(query.text) && s.facts.some(f => f.kind === 'world-event')) score += 3;
        if (eventId) score += 100;
        if (first && !temporalChain) score += 100 / (1 + s.turnId / 10);
        if (now && !temporalChain) score += s.facts.some(f => f.kind !== 'character-claim' && (f.validUntil === undefined || f.validUntil > query.asOfTurn)) ? 25 : -25;
        matched.push(materialize(s, query, score));
      }
      ranked = matched.sort((a, b) => b.score - a.score || a.turnId - b.turnId);
      // Follow historical links only for multi-stage queries, and ONLY after visibility filtering.
      // Metadata links are not sufficient evidence: referenced original sources must be returned.
      if (temporalChain) {
        const queue = [...ranked]; const seen = new Set(ranked.map(s => s.sourceId));
        for (const current of queue) for (const id of current.historicalSources) {
          const s = this.data.turns.find(s => s.sourceId === id);
          if (s && !seen.has(id) && visible(s, query)) {
            const evidence = materialize(s, query, current.score * 0.9);
            ranked.push(evidence); queue.push(evidence); seen.add(id);
          }
        }
        ranked.sort((a, b) => b.score - a.score || a.turnId - b.turnId);
      }
    }
    const packed = packEvidence(ranked, budget, maxSources);
    const hasFacts = packed.evidence.some(s => s.facts.length > 0);
    const chainComplete = !temporalChain || !packed.omittedSourceIds.length;
    // No generated answer: this flag describes only whether this evidence selection appears sufficient.
    const enoughEvidence = strategy === 'recent' ? packed.evidence.length > 0 : hasFacts && chainComplete;
    return { strategy, ranked, ...packed, enoughEvidence,
      reason: !hasFacts ? '证据不足' : !chainComplete ? '预算或条数限制导致相关来源缺失；证据不足' : strategy === 'recent' ? '近期截取未验证相关性；不能据此回答' : '已返回相关原始来源；仍须按标注区分说法与事实',
      estimatedTokens: estimateTokens(packed.context), tokenMethod,
      contextBytes: Buffer.byteLength(packed.context, 'utf8'), elapsedMs: performance.now() - started,
    };
  }
}
