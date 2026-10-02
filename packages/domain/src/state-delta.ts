import { StateDeltaSchema, WorldStateSchema, type StateDelta, type WorldState } from '@jiuxiao/contracts';
/** No model output is accepted here; authored rule deltas must satisfy the recorded preconditions. */
export function applyStateDelta(rawState: WorldState, rawDelta: StateDelta): WorldState {
 const state=WorldStateSchema.parse(rawState), delta=StateDeltaSchema.parse(rawDelta); const facts=structuredClone(state.facts);
 if(delta.locationChange && delta.locationChange.before!==state.locationId) throw new Error('DELTA_LOCATION_CONFLICT');
 for(const change of delta.factChanges){
  const present=Object.hasOwn(facts,change.key);if(present!==change.before.present || (change.before.present && canonicalJson(facts[change.key])!==canonicalJson(change.before.value))) throw new Error('DELTA_FACT_CONFLICT');
  if(change.after.present) Object.defineProperty(facts,change.key,{value:structuredClone(change.after.value),writable:true,enumerable:true,configurable:true});else delete facts[change.key];
 }
 const minutes=state.elapsedMinutes+delta.timeChange;if(!Number.isSafeInteger(minutes))throw new Error('DELTA_TIME_OVERFLOW');
 return WorldStateSchema.parse({...state,locationId:delta.locationChange?.after??state.locationId,elapsedMinutes:minutes,facts});
}
export function canonicalJson(value: unknown): string {
 if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
 if(value!==null&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
 const encoded=JSON.stringify(value);if(encoded===undefined || (typeof value==='number' && !Number.isFinite(value)))throw new Error('NON_JSON_STATE');return encoded;
}
