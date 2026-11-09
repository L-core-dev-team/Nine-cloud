import { readFileSync } from 'node:fs';
import type { Dataset, Fact, Source } from './types.ts';

type Scene = {
  turn: number; people: string[]; place: string; items: string[]; tags: string[];
  text: string; events: string[]; auth: string[]; links?: string[];
  facts: [string, string, string, string, Fact['kind'], (number | null)?, string?][];
};
export function generateDataset(count = 200): Dataset {
  if (![200, 500, 1000].includes(count)) throw new RangeError('Supported sizes: 200, 500, 1000');
  const anchors = JSON.parse(readFileSync(new URL('./anchors.json', import.meta.url), 'utf8')) as {
    entities: Dataset['entities']; scenes: Scene[];
  };
  const scenes = new Map(anchors.scenes.map(s => [s.turn, s]));
  const turns: Source[] = [];
  const locations = ['苇汀渡', '石灯客舍', '旧钟楼', '雾桥'];
  for (let turnId = 1; turnId <= count; turnId++) {
    const scene = scenes.get(turnId);
    const location = scene?.place ?? locations[Math.floor((turnId - 1) / 10) % locations.length]!;
    const day = Math.ceil(turnId / 20);
    const phase = ['晨', '午', '夕', '暮'][Math.floor(((turnId - 1) % 20) / 5)]!;
    const stage = turnId <= 40 ? '初探' : turnId <= 100 ? '修桥' : turnId <= 160 ? '寻柜' : turnId <= 200 ? '归还准备' : '归还之后的行旅';
    turns.push({
      sourceId: `s${String(turnId).padStart(3, '0')}`, turnId,
      gameMinute: (turnId - 1) * 72, gameTime: `第${day}日${phase}`,
      participants: scene?.people ?? ['p-player'], location, items: scene?.items ?? [],
      narrative: scene?.text ?? `第${turnId}回合，旅人在${location}完成${stage}途中的日常整理。${['雨后石阶仍潮湿','灯影随着风轻晃','路边苇叶沙沙作响','远处水声缓慢回荡'][turnId % 4]}。旅人记录沿途见闻，继续既定行程；没有新的物品交接、关系变化或秘密揭晓。`,
      eventIds: scene?.events ?? [], tags: scene?.tags ?? ['日常', stage],
      historicalSources: scene?.links ?? [], authorizedNpcIds: scene?.auth ?? [],
      facts: (scene?.facts ?? []).map(([id, subject, predicate, value, kind, until, supersedes]) => ({
        id, subject, predicate, value, kind, validFrom: turnId,
        ...(until == null ? {} : { validUntil: until }),
        ...(supersedes ? { supersedes } : {}),
        ...(kind === 'world-event' ? { confirmedBy: scene!.events[0]! } : {}),
      })),
    });
  }
  return { schemaVersion: 1, synthetic: true, entities: anchors.entities, turns };
}

export function validateDataset(data: Dataset): void {
  if (data.schemaVersion !== 1 || data.synthetic !== true || ![200, 500, 1000].includes(data.turns.length)) throw new Error('Invalid dataset header');
  const sources = new Map(data.turns.map(s => [s.sourceId, s]));
  const entities = new Set(data.entities.map(e => e.id));
  const facts = new Map(data.turns.flatMap(s => s.facts.map(f => [f.id, f] as const)));
  if (sources.size !== data.turns.length || facts.size !== data.turns.flatMap(s => s.facts).length) throw new Error('Duplicate source/fact');
  for (const [index, s] of data.turns.entries()) {
    if (s.turnId !== index + 1 || s.gameMinute !== index * 72 || !s.narrative || !s.gameTime) throw new Error('Broken continuous clock');
    for (const id of [...s.participants, ...s.items, ...s.authorizedNpcIds]) if (!entities.has(id)) throw new Error(`Unknown entity ${id}`);
    for (const id of s.historicalSources) if (!sources.has(id) || sources.get(id)!.turnId >= s.turnId) throw new Error('Invalid historical source');
    for (const f of s.facts) {
      if (!entities.has(f.subject) || f.validFrom !== s.turnId || (f.validUntil !== undefined && f.validUntil <= f.validFrom)) throw new Error('Invalid fact timeline');
      if (f.kind === 'world-event' && (!f.confirmedBy || !s.eventIds.includes(f.confirmedBy))) throw new Error('Unconfirmed world event');
      if (f.kind !== 'world-event' && f.confirmedBy) throw new Error('Narrative promoted to world event');
      if (f.supersedes && (!facts.has(f.supersedes) || facts.get(f.supersedes)!.validUntil !== f.validFrom)) throw new Error('Invalid supersession');
    }
  }
}

export function loadDataset(path: string): Dataset {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Dataset;
  validateDataset(data);
  return data;
}
