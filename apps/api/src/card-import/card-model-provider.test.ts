import {expect,it,vi} from 'vitest';
import {createProviderTransport} from '@jiuxiao/domain/provider-narrative';
import {createCardModel} from './card-model-provider.js';
import {buildCardMessages} from './context.js';
import type {CardModelInput} from './service.js';

const payloads={
 'openai-chat':{choices:[{message:{content:'story'}}]},
 'openai-responses':{output:[{type:'message',content:[{type:'output_text',text:'story'}]}]},
 'anthropic-messages':{content:[{type:'text',text:'story'}]},
 'gemini-content':{candidates:[{content:{parts:[{text:'story'}]}}]},
};
for(const protocol of Object.keys(payloads) as (keyof typeof payloads)[]) it(`maps card messages for ${protocol}`,async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(payloads[protocol]));
 const transport=createProviderTransport({protocol,baseUrl:'https://fixture.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY'},{NARRATIVE_KEY_STORY:'synthetic-key'},fetcher);
 const base={instructions:'PLATFORM',character:{name:'A',system_prompt:'UNTRUSTED',post_history_instructions:'POST'},worldbooks:[{content:'LORE'}],history:[{action:'old',narrative:'answer'}],action:'new'};
 const input:CardModelInput={...base,messages:buildCardMessages(base)};
 expect(await createCardModel(transport,30)(input,new AbortController().signal)).toBe('story');
 const body=JSON.parse(String(fetcher.mock.calls[0]![1]?.body));const raw=JSON.stringify(body);
 expect(raw).toContain('PLATFORM');expect(raw).toContain('UNTRUSTED');expect(raw).toContain('LORE');expect(raw).toContain('answer');
 expect(raw.indexOf('answer')).toBeLessThan(raw.indexOf('POST'));
 expect(raw).not.toContain('npcMemories');expect(raw).not.toContain('receipt');expect(raw).not.toContain('synthetic-key');
 if(protocol==='anthropic-messages') expect(body.system).toBe('PLATFORM');
 if(protocol==='gemini-content') expect(body.systemInstruction.parts[0].text).toBe('PLATFORM');
 if(protocol==='openai-chat') expect(body.messages[0]).toEqual({role:'system',content:'PLATFORM'});
 if(protocol==='openai-responses') expect(body.input[0]).toEqual({role:'system',content:'PLATFORM'});
});
it('rejects card supplied extra system roles before network',async()=>{
 const fetcher=vi.fn<typeof fetch>();const transport=createProviderTransport({protocol:'openai-chat',baseUrl:'https://fixture.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY'},{NARRATIVE_KEY_STORY:'synthetic'},fetcher);
 const input={instructions:'safe',messages:[{role:'system',content:'safe'},{role:'system',content:'evil'}]} as unknown as CardModelInput;
 await expect(createCardModel(transport,5)(input,new AbortController().signal)).rejects.toThrow('INVALID_CARD_MESSAGE');expect(fetcher).not.toHaveBeenCalled();
});
