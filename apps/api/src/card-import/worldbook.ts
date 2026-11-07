import { CardError, record } from './parser.js';

/** Bounded subset; unsupported advanced features fail closed instead of being ignored. */
export function selectWorldbookEntries(books: Record<string, unknown>[], history: {action:string; narrative:string}[], action: string, random: () => number = Math.random): Record<string, unknown>[] {
  const messages = [...history.flatMap(t => [t.action, t.narrative]), action];
  const selected: {content:string; position:string; order:number; index:number}[] = [];
  let examined = 0;
  for (const book of books) {
    const entries = Array.isArray(book.entries) ? book.entries : record(book.entries) ? Object.values(book.entries) : [];
    const bookDepth = typeof book.scan_depth === 'number' ? book.scan_depth : 20;
    for (const raw of entries) {
      if (++examined > 1000) throw new CardError('WORLDBOOK_ENTRY_LIMIT', 413);
      if (!record(raw) || raw.enabled === false || raw.disable === true) continue;
      const ext = record(raw.extensions) ? raw.extensions : {};
      const supportedExtensions = new Set(['scan_depth', 'case_sensitive', 'match_whole_words', 'constant', 'position', 'selectiveLogic', 'probability', 'use_probability']);
      if (Object.keys(ext).some(key => !supportedExtensions.has(key))) throw new CardError('WORLDBOOK_UNSUPPORTED_FEATURE');
      if (ext.group || ext.delay_until_recursion || ext.prevent_recursion || ext.recursive_scanning || raw.group || raw.delayUntilRecursion || raw.preventRecursion || raw.recursive) throw new CardError('WORLDBOOK_UNSUPPORTED_FEATURE');
      const main = Array.isArray(raw.keys) ? raw.keys : Array.isArray(raw.key) ? raw.key : [];
      const secondary = Array.isArray(raw.secondary_keys) ? raw.secondary_keys : Array.isArray(raw.keysecondary) ? raw.keysecondary : [];
      const keys = [...main, ...secondary];
      if (keys.some(k => typeof k !== 'string' || k.length > 500 || /^\/.+\/[a-z]*$/i.test(k))) throw new CardError('WORLDBOOK_UNSUPPORTED_KEY');
      const depth = ext.scan_depth ?? raw.scanDepth ?? bookDepth;
      if (!Number.isInteger(depth) || Number(depth) < 1 || Number(depth) > 100) throw new CardError('WORLDBOOK_INVALID_DEPTH');
      const sensitive = raw.case_sensitive ?? raw.caseSensitive ?? ext.case_sensitive ?? book.case_sensitive ?? false;
      const whole = raw.matchWholeWords ?? ext.match_whole_words ?? false;
      const haystack = messages.slice(-Number(depth)).join('\n').slice(-80_000);
      const match = (key: unknown) => {
        if (typeof key !== 'string' || !key) return false;
        const needle = sensitive ? key : key.toLowerCase(), hay = sensitive ? haystack : haystack.toLowerCase();
        let pos = hay.indexOf(needle);
        while (pos >= 0) {
          const word = (s: string | undefined) => !!s && /[\p{L}\p{N}_]/u.test(s);
          if (!whole || (!word(hay[pos-1]) && !word(hay[pos+needle.length]))) return true;
          pos = hay.indexOf(needle, pos+1);
        }
        return false;
      };
      const constant = raw.constant === true || ext.constant === true;
      if (!constant && !main.some(match)) continue;
      if (!constant && (raw.selective === true || secondary.length > 0) && secondary.length) {
        const mode = raw.selectiveLogic ?? ext.selectiveLogic ?? 0;
        const hits = secondary.map(match);
        const allowed = mode === 0 ? hits.some(Boolean) : mode === 1 ? !hits.every(Boolean) : mode === 2 ? !hits.some(Boolean) : mode === 3 ? hits.every(Boolean) : false;
        if (![0,1,2,3].includes(Number(mode))) throw new CardError('WORLDBOOK_UNSUPPORTED_LOGIC');
        if (!allowed) continue;
      }
      const probability = raw.probability ?? ext.probability ?? 100;
      const useProbability = raw.useProbability ?? ext.use_probability ?? true;
      if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 100 || typeof useProbability !== 'boolean') throw new CardError('WORLDBOOK_INVALID_PROBABILITY');
      if (useProbability && probability < 100) {
        const roll = random();
        if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new CardError('WORLDBOOK_INVALID_RANDOM');
        if (roll * 100 > probability) continue;
      }
      if (typeof raw.content !== 'string' || !raw.content) continue;
      const pos = raw.position ?? ext.position ?? 'before_char';
      const position = pos === 0 || pos === 'before_char' ? 'before_char' : pos === 1 || pos === 'after_char' ? 'after_char' : null;
      if (!position) throw new CardError('WORLDBOOK_UNSUPPORTED_POSITION');
      const order = Number(raw.insertion_order ?? raw.order ?? 100);
      if (!Number.isFinite(order)) throw new CardError('WORLDBOOK_INVALID_ORDER');
      selected.push({content:raw.content, position, order, index:examined});
      if (selected.length > 100) throw new CardError('WORLDBOOK_MATCH_LIMIT', 413);
    }
  }
  selected.sort((a,b) => a.order-b.order || a.index-b.index);
  if (Buffer.byteLength(JSON.stringify(selected)) > 50_000) throw new CardError('WORLDBOOK_CONTEXT_LIMIT', 413);
  return selected.map(({content,position,order}) => ({content,position,order}));
}
