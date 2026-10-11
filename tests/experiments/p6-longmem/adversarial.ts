import { generateDataset } from './dataset.ts';
import type { Dataset } from './types.ts';

/** Supplementary fixture; leaves the frozen 60-question corpus unchanged. */
export function generateAdversarialDataset(): Dataset {
  const data = generateDataset();
  data.entities.push({ id: 'p-su-other', name: '苏禾', aliases: ['商馆管事苏禾'], kind: 'person' });
  data.turns[129] = {
    sourceId: 's130', turnId: 130, gameMinute: 129 * 72, gameTime: '第7日午',
    participants: ['p-player', 'p-su-other'], location: '石灯客舍', items: [],
    narrative: '旅人在石灯客舍认识商馆管事苏禾。他与渡口商人苏禾同名，但有独立身份凭证，二者不是同一个人。商馆管事此刻在石灯客舍。',
    eventIds: ['e130-meet'], tags: ['初遇', '身份'], historicalSources: [], authorizedNpcIds: ['p-su-other'],
    facts: [{ id: 'f130-location', subject: 'p-su-other', predicate: '所在地', value: '石灯客舍', kind: 'world-event', validFrom: 130, confirmedBy: 'e130-meet' }],
  };
  return data;
}
