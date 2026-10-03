import {catalogSnapshotDiff} from './ai-model-inventory';
import { describe, expect, it } from 'vitest';
import { filterRouterModels, normalizeRouterModels } from './ai-model-inventory';

const now = Date.parse('2026-09-30T00:00:00Z');
const snapshot = (pricing: unknown, extra = {}) => normalizeRouterModels({ data: [
  { id: 'openai/example', pricing, ...extra },
] }, now)[0]!;

describe('public model catalog boundaries', () => {
  it('exposes explicit hosted-route metadata without guessing price or capability', () => {
    expect(snapshot({}, { created: 1780000000 })).toMatchObject({ provider: 'openrouter', modelId: 'openai/example', capability: null, price: {input: null, output: null, currency: 'USD', unit: 'million_tokens'}, updatedAt: new Date(now).toISOString() });
    expect(snapshot({}, { architecture: {output_modalities: ['text']} }).capability).toEqual({outputModalities: ['text']});
  });
  it.each([null, undefined, '', '  ', true, false, [], {}, '-1', 'NaN', 'Infinity', '0x10', 1e308])(
    'does not treat invalid price %j as a zero-price quote', value => {
      const model = snapshot({ prompt: value, completion: value });
      expect(model.inputUsdPerMillion).toBeNull();
      expect(model.outputUsdPerMillion).toBeNull();
    },
  );

  it('preserves explicit free prices and converts decimal/exponent prices', () => {
    expect(snapshot({ prompt: '0', completion: 0 })).toMatchObject({ inputUsdPerMillion: 0, outputUsdPerMillion: 0 });
    expect(snapshot({ prompt: ' 1e-6 ', completion: '.000002' })).toMatchObject({ inputUsdPerMillion: 1, outputUsdPerMillion: 2 });
  });

  it.each([NaN, Infinity, -1, 1e30, '1780000000'])('isolates invalid creation time %j without losing valid entries', created => {
    const models = normalizeRouterModels({ data: [
      { id: 'openai/invalid-date', created },
      { id: 'openai/valid-date', created: 1780000000 },
    ] }, now);
    expect(models).toHaveLength(2);
    expect(models.find(model => model.id === 'openai/invalid-date')?.updated).toBeNull();
    expect(models.find(model => model.id === 'openai/valid-date')?.updated).toMatch(/^2026-/);
  });

  it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('marks invalid context %j as unknown', context_length => {
    expect(snapshot({}, { context_length }).context).toBeNull();
  });

  it('deduplicates normalized IDs and suppresses conflicting prices', () => {
    const models = normalizeRouterModels({ data: [
      { id: ' openai/example ', pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'openai/example', pricing: { prompt: '0.000003', completion: '0.000002' } },
      { id: 'openai/example', pricing: { prompt: '0.000001', completion: '0.000002' } },
    ] }, now);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ id: 'openai/example', inputUsdPerMillion: null, outputUsdPerMillion: 2 });
  });

  it('filters retired and non-text routes and expires at the boundary', () => {
    const models = normalizeRouterModels({ data: [
      { id: 'openai/expired', expiration_date: new Date(now).toISOString() },
      { id: 'openai/image', architecture: { output_modalities: ['image'] } },
      { id: 'unmapped/live', architecture: { output_modalities: ['text'] } },
    ] }, now);
    expect(models.map(model => model.id)).toEqual(['unmapped/live']);
    expect(filterRouterModels(models, '', 'openai')).toEqual([]);
    expect(filterRouterModels(models, 'live')).toHaveLength(1);
  });

  it('keeps source links on the model page rather than injecting query/fragment fields', () => {
    expect(snapshot({}, { id: 'vendor/model?token=value#fragment' }).source)
      .toBe('https://openrouter.ai/vendor/model%3Ftoken%3Dvalue%23fragment');
  });

  it.each([null, [], {}, { data: null }, { data: {} }])('rejects unrecognized catalog root %j', payload => {
    expect(() => normalizeRouterModels(payload, now)).toThrow('型号目录返回格式无法识别');
  });
  it('reports missing capability and quote conflicts without inventing model data',()=>{
    const rows=normalizeRouterModels({data:[{id:'vendor/m',pricing:{prompt:'0.000001',completion:'0.000002'}},{id:'vendor/m',pricing:{prompt:'0.000003',completion:'0.000002'}}]},now);
    expect(rows[0]).toMatchObject({provider:'openrouter',modelId:'vendor/m',displayName:'vendor/m',contextLimit:null,capabilities:null,pricingStatus:'conflict',price:{input:null,output:2,currency:'USD',unit:'million_tokens'},pricingSource:'https://openrouter.ai/api/v1/models',status:'unknown'});
  });
 it('does not equate catalog disappearance with retirement and reports unknown/changed quotes',()=>{
  const a=normalizeRouterModels({data:[{id:'v/a',pricing:{prompt:'1',completion:'2'}},{id:'v/b'}]},now);
  const b=normalizeRouterModels({data:[{id:'v/a',status:'unavailable',pricing:{prompt:'3',completion:'2'}},{id:'v/c'}]},now);
  expect(catalogSnapshotDiff(a,b)).toMatchObject({added:['v/c'],notReturned:[{modelId:'v/b',availability:'unknown'}],changed:[{modelId:'v/a',status:'unavailable'}],unknownPrices:['v/c']});
  expect(filterRouterModels(b,'')).toHaveLength(1);
 });

});
