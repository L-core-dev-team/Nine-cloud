import { describe, expect, it } from 'vitest';
import type { ActionIntent, SaveEnvelope } from '@jiuxiao/contracts';
import { prepareTurn } from '@jiuxiao/domain';
import { randomUUID } from 'node:crypto';
import plugin from './p1-prologue-plugin.js';
import { AuthoritativeGameService } from './authoritative-game.js';
import { publicPrologueReceipt } from './prologue-public-receipt.js';

describe('player-visible prologue receipt', () => {
  it('attributes the retreat, keeps the subsequent observation separate and publishes only the observed clue', async () => {
    const games = new AuthoritativeGameService({getForOwner:async()=>null,createForOwner:async()=>true},plugin);
    const result = await games.create('fixture-owner',randomUUID(),{});
    if (result.status !== 'created') throw Error('fixture creation failed');
    let save: SaveEnvelope = result.save;
    save.state.facts.stamina = 10;
    async function step(action: Pick<ActionIntent,'kind'|'payload'>) {
      const intent = {...action, saveId:save.saveId, actorId:save.state.playerId, idempotencyKey:randomUUID(), expectedRevision:save.revision, branchId:'root'} as ActionIntent;
      const turn = await prepareTurn({intent,save,decide:plugin.rules!.decide,reduce:plugin.rules!.reduce});
      if (turn.status !== 'prepared') throw Error('fixture action failed');
      save = turn.save;
      return turn.receipt;
    }
    await step({kind:'move',payload:{destinationId:'subloc_ferry_berm'}});
    const retreat = await step({kind:'combat',payload:{targetId:'npc_shuiyuya'}});
    expect(publicPrologueReceipt(retreat,save.state).本回合).toEqual([{行动者:'玩家',对手:'灰羽鸦',已结算:'玩家撤退，本次未清障',已退出:'渡口作业位',退后所在:'芦花渡',剩余体力:0,耗时分钟:30}]);
    const observation = await step({kind:'observe',payload:{targetId:'obj_ferry',method:'scan'}});
    const visible = publicPrologueReceipt(observation,save.state,retreat);
    expect(visible.延续状态).toEqual({上回已完成:'玩家已退出渡口作业位',此刻所在地:'芦花渡',当前体力:0});
    expect(visible.本回合).toHaveLength(1);
    expect(JSON.stringify(visible)).toContain('渡槽淤了半尺');
    expect(JSON.stringify(visible)).not.toMatch(/刷子是新的|stateDelta|locationGraph|creationRequestHash/);
    expect(() => publicPrologueReceipt(observation,save.state,{...retreat,saveId:'unrelated'})).toThrow('PRIOR_RECEIPT_MISMATCH');
  });
});
