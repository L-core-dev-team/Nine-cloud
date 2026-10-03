import {describe,it,expect} from 'vitest';
import {buildGenerationRequest} from './ai-generation-request';
import type {ProtocolId} from './ai-protocols';
describe('approved generation parameter boundary (request construction, no provider calls)',()=>{
 it.each(['openai-chat','openai-responses','anthropic-messages','gemini-content'] as ProtocolId[])('%s rejects unknown saved parameters and inherited fields',protocol=>{
  const config=Object.assign(Object.create({top_p:0.3}),{temperature:0.7,max_tokens:128,tools:[{danger:true}],logit_bias:{secret:99},stop:['x'],seed:123,stream:true,frequency_penalty:1});
  const request=buildGenerationRequest(protocol,'https://fixture.invalid','fixture','test-only','text',config);const body=JSON.stringify(request.body);
  for(const unknown of ['tools','logit_bias','stop','seed','frequency_penalty','0.3'])expect(body).not.toContain(unknown);
  expect(body).toContain('128');expect(body).toContain('0.7');expect(body).not.toContain('test-only');
 });
 it('omits model-incompatible sampling and refuses fractional output bounds',()=>{
  const body=JSON.stringify(buildGenerationRequest('anthropic-messages','https://fixture.invalid','claude-opus-5-5','','text',{temperature:0.7,top_p:0.9}).body);
  expect(body).not.toContain('temperature');expect(body).not.toContain('top_p');
  expect(()=>buildGenerationRequest('openai-chat','https://fixture.invalid','fixture','','text',{max_tokens:1.5})).toThrow('INVALID_OUTPUT_LIMIT');
 });
});
