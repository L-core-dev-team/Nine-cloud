import { getEncoding } from 'js-tiktoken';
import type { CardModelInput } from './service.js';

// Text-only profiles for the two fixed, independently approved Chat Completions IDs.
// Local Luna caps keep the existing bounded context builder and short card responses.
export const CARD_MODELS = {
 'gpt-4o-2024-08-06': { context: 128000, output: 16384 },
 'gpt-6-luna': { context: 65536, output: 4096 },
} as const;
export type CardModelId = keyof typeof CARD_MODELS;
export const LUNA_TOKEN_METHOD = 'UTF-8 bytes + 16 per message and reply framing + max(1024,10%) margin; estimate';
// Chat framing estimate: OpenAI cookbook How_to_count_tokens_with_tiktoken.
// Not provider billing / not an exact guarantee of server-side framing.
const encoder = getEncoding('o200k_base');
export const CARD_TOKEN_METHOD = 'js-tiktoken@1.0.21/o200k_base; bounded text chunks/chat estimate + max(1024,10%) margin';
// Prevent a long repeated BPE span from monopolizing the server. Chunk boundaries
// may overestimate token count: this is deliberately an estimate, not exact usage.
function textTokens(text: string): number {
 let count=0,chunk='';
 for(const point of text){chunk+=point;if(chunk.length>=128){count+=encoder.encode(chunk,[],[]).length;chunk='';}}
 return count+(chunk?encoder.encode(chunk,[],[]).length:0);
}
export function cardInputTokens(input: CardModelInput, model: CardModelId = 'gpt-4o-2024-08-06'): number {
 const turns: {role:string;content:string}[]=[];
 for(const m of input.messages) {
  const prior=turns.at(-1);
  // Exactly the shared protocol's adjacent user/assistant merge boundary.
  if(prior && m.role!=='system' && prior.role===m.role) prior.content+='\n\n---\n\n'+m.content;
  else turns.push({...m});
 }
 // The installed tokenizer has no verified Luna mapping. Count UTF-8 on the
 // actual roles/text, including join separators. Never expose this as billed usage.
 if (model === 'gpt-6-luna') {
  return 16 + turns.reduce((total, m) =>
   total + 16 + Buffer.byteLength(m.role === 'system' ? 'developer' : m.role) + Buffer.byteLength(m.content), 0);
 }
 return 3+turns.reduce((n,m)=>n+3+textTokens(m.role)+textTokens(m.content),0);
}
export function cardFitsBudget(input: CardModelInput, contextWindow: number, maxOutputTokens: number, model: CardModelId = 'gpt-4o-2024-08-06'): boolean {
 const tokens=cardInputTokens(input,model);
 return tokens+maxOutputTokens+Math.max(1024,Math.ceil(tokens*0.1))<=contextWindow;
}
