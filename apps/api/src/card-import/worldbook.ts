import { CardError, record } from './parser.js';

/** Bounded subset; unsupported advanced features fail closed instead of being ignored. */
export function selectWorldbookEntries(books: Record<string, unknown>[], history: {action:string; narrative:string}[], action: string, random: () => number = Math.random): Record<string, unknown>[] {
  const messages = [...history.flatMap(t => [t.action, t.narrative]), action];
  const selected: {content:string; position:string; order:number; index:number}[] = [];
  const totalEntries=books.reduce((n,b)=>n+(Array.isArray(b.entries)?b.entries.length:record(b.entries)?Object.keys(b.entries).length:0),0);
  if(totalEntries>1000)throw new CardError('WORLDBOOK_ENTRY_LIMIT',413);
  let examined = 0;
  const seen = new Set<string>(), wonGroups = new Set<string>();
  const recurse: string[] = [];
  for (let round=0; round<=4; round++) {
  const candidates: {id:string; group:string; override:boolean; weight:number; probability:number; useProbability:boolean; content:string; position:string; order:number; index:number; prevent:boolean}[]=[];
  let bookIndex=0;
  for (const book of books) {
    const currentBook=bookIndex++; let entryIndex=0;
    const entries = Array.isArray(book.entries) ? book.entries : record(book.entries) ? Object.values(book.entries) : [];
    const bookDepth = typeof book.scan_depth === 'number' ? book.scan_depth : 20;
    for (const raw of entries) {
      const id=`${currentBook}:${entryIndex++}`;
      if (++examined > 5000) throw new CardError('WORLDBOOK_ENTRY_LIMIT', 413);
      if (seen.has(id)) continue;
      if (!record(raw) || raw.enabled === false || raw.disable === true) continue;
      const ext = record(raw.extensions) ? raw.extensions : {};
      const supportedExtensions = new Set(['scan_depth', 'case_sensitive', 'match_whole_words', 'constant', 'position', 'selectiveLogic', 'probability', 'use_probability', 'group', 'group_override', 'group_weight', 'prevent_recursion', 'exclude_recursion']);
      if (Object.keys(ext).some(key => !supportedExtensions.has(key))) throw new CardError('WORLDBOOK_UNSUPPORTED_FEATURE');
      if (ext.delay_until_recursion || ext.recursive_scanning || raw.delayUntilRecursion || raw.recursive) throw new CardError('WORLDBOOK_UNSUPPORTED_FEATURE');
      const main = Array.isArray(raw.keys) ? raw.keys : Array.isArray(raw.key) ? raw.key : [];
      const secondary = Array.isArray(raw.secondary_keys) ? raw.secondary_keys : Array.isArray(raw.keysecondary) ? raw.keysecondary : [];
      const keys = [...main, ...secondary];
      if (keys.some(k => typeof k !== 'string' || k.length > 500 || /^\/.+\/[a-z]*$/i.test(k))) throw new CardError('WORLDBOOK_UNSUPPORTED_KEY');
      const depth = ext.scan_depth ?? raw.scanDepth ?? bookDepth;
      if (!Number.isInteger(depth) || Number(depth) < 1 || Number(depth) > 100) throw new CardError('WORLDBOOK_INVALID_DEPTH');
      const sensitive = raw.case_sensitive ?? raw.caseSensitive ?? ext.case_sensitive ?? book.case_sensitive ?? false;
      const whole = raw.matchWholeWords ?? ext.match_whole_words ?? false;
      if (round>0 && (raw.excludeRecursion === true || ext.exclude_recursion === true)) continue;
      const haystack = [...messages.slice(-Number(depth)),...recurse].join('\n').slice(-80_000);
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
      if (typeof raw.content !== 'string' || !raw.content) continue;
      const pos = raw.position ?? ext.position ?? 'before_char';
      const position = pos === 0 || pos === 'before_char' ? 'before_char' : pos === 1 || pos === 'after_char' ? 'after_char' : null;
      if (!position) throw new CardError('WORLDBOOK_UNSUPPORTED_POSITION');
      const order = Number(raw.insertion_order ?? raw.order ?? 100);
      if (!Number.isFinite(order)) throw new CardError('WORLDBOOK_INVALID_ORDER');
      const group=raw.group ?? ext.group ?? '';
      const override=raw.groupOverride ?? ext.group_override ?? false;
      const weight=raw.groupWeight ?? ext.group_weight ?? 100;
      if(typeof group!=='string' || group.length>256 || group.includes(',') || typeof override!=='boolean' || typeof weight!=='number' || !Number.isFinite(weight) || weight<1 || weight>10000) throw new CardError('WORLDBOOK_UNSUPPORTED_GROUP');
      candidates.push({id,group,override,weight,probability,useProbability,content:raw.content,position,order,index:currentBook*1000+entryIndex,prevent:raw.preventRecursion===true||ext.prevent_recursion===true});
    }
  }
  const groups = new Map<string,typeof candidates>();
  const winners:typeof candidates=[];
  for(const c of candidates) {
    if(!c.group) winners.push(c);
    else if(!wonGroups.has(c.group)) { const g=groups.get(c.group)??[];g.push(c);groups.set(c.group,g); }
  }
  for(const group of groups.values()) {
    const overrides=group.filter(c=>c.override).sort((a,b)=>b.order-a.order||a.index-b.index);
    if(overrides.length) winners.push(overrides[0]!);
    else if(group.length===1) winners.push(group[0]!);
    else {const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new CardError('WORLDBOOK_INVALID_RANDOM');let value=roll*group.reduce((a,c)=>a+c.weight,0);let winner=group[group.length-1]!;for(const c of group){value-=c.weight;if(value<=0){winner=c;break;}}winners.push(winner);}
  }
  if(!winners.length) break;
  if(round===4) throw new CardError('WORLDBOOK_RECURSION_LIMIT',413);
  let activated=0;
  for(const c of winners) {
    seen.add(c.id);
    if(c.useProbability && c.probability<100){const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new CardError('WORLDBOOK_INVALID_RANDOM');if(roll*100>c.probability)continue;}
    if(c.group)wonGroups.add(c.group);
    selected.push({content:c.content,position:c.position,order:c.order,index:c.index});
    if(selected.length>100)throw new CardError('WORLDBOOK_MATCH_LIMIT',413);
    if(Buffer.byteLength(JSON.stringify(selected))>50_000)throw new CardError('WORLDBOOK_CONTEXT_LIMIT',413);
    if(!c.prevent)recurse.push(c.content);
    activated++;
  }
  if(!activated)break;
  }
  selected.sort((a,b) => a.order-b.order || a.index-b.index);
  if (Buffer.byteLength(JSON.stringify(selected)) > 50_000) throw new CardError('WORLDBOOK_CONTEXT_LIMIT', 413);
  return selected.map(({content,position,order}) => ({content,position,order}));
}
