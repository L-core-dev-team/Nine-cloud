import { generateDataset, loadDataset, validateDataset } from './dataset.ts';
import { HistoryIndex } from './retrieval.ts';
const args = process.argv.slice(2);
function option(key: string, fallback: string) { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1] ?? fallback; }
const historyPath = option('--history', '');
const data = historyPath ? loadDataset(historyPath) : generateDataset(Number(option('--turns', '200'))); validateDataset(data);
const npc = option('--npc', '');
const result = new HistoryIndex(data).search({
  text: option('--text', '我第一次遇到那名剑修时，他交给了我什么？'),
  asOfTurn: Number(option('--as-of', String(data.turns.length))),
  audience: npc ? { kind: 'npc', npcId: npc } : { kind: 'player' },
  ...(args.includes('--from-turn') || args.includes('--to-turn') ? { turnRange: [Number(option('--from-turn', '1')), Number(option('--to-turn', String(data.turns.length)))] as [number, number] } : {}),
  ...(args.includes('--from-minute') || args.includes('--to-minute') ? { gameMinuteRange: [Number(option('--from-minute', '0')), Number(option('--to-minute', String((data.turns.length - 1) * 72)))] as [number, number] } : {}),
}, Number(option('--budget', '1024')), option('--strategy', 'historical') === 'recent' ? 'recent' : 'historical');
console.log(JSON.stringify(result, null, 2));
