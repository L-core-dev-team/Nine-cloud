import { it, expect } from 'vitest';
import { prepareTurn } from '@jiuxiao/domain';
import type { SaveEnvelope, ActionIntent } from '@jiuxiao/contracts';
import { validateGameReceipt } from './game-receipt-validation';
const scope = { apiBase: 'https://example.invalid/api', ownerId: 'owner', saveId: 'save' };
const save: SaveEnvelope = { schemaVersion: 1, saveId: 'save', canonVersion: 'c', ruleVersion: 'r', memoryPolicyVersion: 'm', revision: 3, state: { playerId: 'actor', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
const pending = { text: '观察渡船', expectedRevision: 3, idempotencyKey: '11111111-1111-4111-8111-111111111111', draftVersion: 1, requestNarrative: true, clarificationOf: 'interaction-a' };
async function authoritativeReceipt() {
 const intent: ActionIntent = { kind: 'free_text', saveId: 'save', actorId: 'actor', branchId: 'root', expectedRevision: 3, idempotencyKey: pending.idempotencyKey, clarificationOf: pending.clarificationOf, payload: { text: pending.text } };
 const result = await prepareTurn({ save, intent, decide: () => ({ status: 'rejected', revision: 3, code: 'FIXTURE', message: 'fixture' }), reduce: state => state });
 if(result.status !== 'recorded') throw Error('fixture'); return result.receipt;
}
it('accepts the real domain fingerprint, including clarification linkage, without trusting display preferences', async () => {
 const receipt = await authoritativeReceipt();
 expect(await validateGameReceipt(scope, pending, save, receipt)).toEqual(receipt);
 expect(await validateGameReceipt(scope, {...pending, requestNarrative:false}, save, receipt)).toEqual(receipt);
});
it('rejects a valid-looking receipt for different text, actor, revision or clarification', async () => {
 const receipt = await authoritativeReceipt();
 for(const change of [{text:'去望气台'},{expectedRevision:2},{clarificationOf:'interaction-b'}]) await expect(validateGameReceipt(scope,{...pending,...change},save,receipt)).rejects.toThrow('INVALID_GAME_RECEIPT');
 await expect(validateGameReceipt(scope,pending,{...save,state:{...save.state,playerId:'other'}},receipt)).rejects.toThrow('INVALID_GAME_RECEIPT');
});
it('rejects a wrong save or request identity even if the fingerprint is copied', async () => {
 const receipt = await authoritativeReceipt();
 for(const change of [{saveId:'other'},{idempotencyKey:'22222222-2222-4222-8222-222222222222'}]) await expect(validateGameReceipt(scope,pending,save,{...receipt,...change})).rejects.toThrow('INVALID_GAME_RECEIPT');
});
