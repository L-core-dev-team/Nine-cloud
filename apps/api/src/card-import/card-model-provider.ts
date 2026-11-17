import type { createProviderTransport } from '@jiuxiao/domain/provider-narrative';
import type { CardModel } from './service.js';

/** The host supplies an authorized transport; card data never supplies endpoint, keys or proxy. */
export function createCardModel(transport: ReturnType<typeof createProviderTransport>, maxOutputTokens: number): CardModel {
 if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>100_000) throw new Error('INVALID_CARD_OUTPUT_LIMIT');
 return async (input,signal) => {
  const [system,...messages]=input.messages;
  if(!system||system.role!=='system'||system.content!==input.instructions||messages.some(m=>m.role!=='user'&&m.role!=='assistant')) throw new Error('INVALID_CARD_MESSAGE');
  const result=await transport({mode:'card',system:system.content,messages:messages as {role:'user'|'assistant';content:string}[],maxOutputTokens},signal);
  return result.text;
 };
}
