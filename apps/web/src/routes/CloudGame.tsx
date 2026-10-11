import { useCloudGameSession } from '../use-cloud-game-session';
import { useState, type FormEvent } from 'react';
import { formatReceiptDelta, projectReceiptEvents } from '../receipt-event-view';
import { GameShell, GameInfoDialog } from '../components/GameShell';
import { DecisionV2Schema } from '@jiuxiao/contracts';
import { buildGameplayBrief, textForClarificationCandidate } from '../gameplay-brief';

export function CloudGame({ saveId, onBack, onHome, onLogin, onWorld }: { saveId: string; onBack: () => void; onHome: () => void; onLogin: () => void; onWorld: () => void }) {
  const game = useCloudGameSession(saveId);
  const { save, cache, text, edit: setText, busy, notice, suggestions } = game;
  const [showState, setShowState] = useState(false);
  const receipt = cache?.history.at(-1)?.receipt ?? null;
  const narrative = cache?.history.at(-1)?.text ?? '';
  const notFound = game.notFound;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void game.submit(); };
  const eventRows = projectReceiptEvents(receipt);
  const brief = save ? buildGameplayBrief(save, receipt, suggestions) : null;
  const parsed = DecisionV2Schema.safeParse(receipt?.decision);
  const clarification = parsed.success && parsed.data.status === 'clarify' ? parsed.data : null;
  return <GameShell saveId={saveId} readingReady={!!save && !!cache} readingPosition={cache?.position} onReadingPositionChange={game.rememberPosition} readingScope={cache?.key}>
    <header className="game-topline"><div><span className="eyebrow">服务端规则存档</span><h2>行旅</h2></div><button className="secondary" onClick={onBack}>返回山门</button></header>
    <div className="game-workspace cloud-game" data-testid="p2-cloud-game">
      <aside className="game-rail" aria-label="游戏资料"><button aria-expanded={showState} disabled={!save} onClick={() => setShowState(true)}>存档状态</button><button onClick={onWorld}>世界设定</button></aside>
      <div className="story-column">
      <div className="story-reading" role="region" tabIndex={0} aria-label="剧情记录">
    <p data-reading-id="game-status" className="game-statusline" role="status" data-testid="p2-status">{notice}</p>
    {!save && !notFound && <div className="card"><p>存档尚未载入。请用创建时的游客或邮箱会话恢复。</p><button className="primary" onClick={onLogin}>账号与云档</button></div>}
    {notFound && <div className="card"><h2>找不到这份存档</h2><p>账号下没有这份服务端存档，或链接来自另一个账号。</p><button className="primary" onClick={onHome}>回到首页</button></div>}
    {save && <>
      <section data-reading-id="game-state" className="cloud-game-state" aria-label="服务端存档状态">
        <p>修订 <strong data-testid="p2-revision">{save.revision}</strong></p>
        <p>游戏分钟 <strong data-testid="p2-game-minute">{typeof save.state.facts.gameMinute === 'number' ? save.state.facts.gameMinute : '未记录'}</strong></p>
        <p>记忆模式 <strong>{save.schemaVersion === 3 && save.memoryMode === 'forgetting' ? '真实遗忘' : save.schemaVersion === 3 && save.memoryMode === 'continue' ? '存档与继续' : '旧版存档'}</strong></p>
        <p>规则版本 <code>{save.ruleVersion}</code></p>
      </section>
      {brief && <section className="card" data-reading-id="game-brief" aria-label="行旅简报" data-testid="p3-world-brief">
        <h3>行旅简报</h3><p>当前地点：{brief.currentLocation}</p>
        <p>{brief.recentRecord}</p><p>{brief.questStatus}</p><p>{brief.offlineProgress}</p>
      </section>}
      {clarification && <section className="card" data-reading-id="game-clarification" aria-label="需要补充的行动">
        <p>{clarification.question}</p>
        {clarification.candidates?.map((candidate, index) => <button className="secondary" key={index} disabled={busy} onClick={() => setText(textForClarificationCandidate(candidate, suggestions))}>{candidate.label}</button>)}
        <p>选择只填写行动；请核对或编辑后提交。确认前世界不会推进。</p>
      </section>}
      {(cache?.history.slice(0, -1) ?? []).map(row => <section className="card" key={row.id} data-reading-id={row.id}><p>{row.text}</p></section>)}
      {!!narrative && <section data-reading-id={receipt?.idempotencyKey} className="card" aria-label="行动叙述"><h3>发生了什么</h3><p data-testid="p2-narrative">{narrative}</p></section>}
      {!!receipt && <section className="card" data-reading-id="game-receipt" data-testid="p2-receipt" aria-label="状态回执">
        <h3>状态回执</h3>
        <p>请求：<code>{receipt.idempotencyKey}</code> · 修订 {receipt.resultingRevision}</p>
        <p>裁决：{receipt.decision.status}</p>
        {eventRows.length ? <ul>{eventRows.map(event => <li key={event.eventId}>
          {event.eventType} · 事件修订 {event.stateRevision}{event.delta ? ` · ${formatReceiptDelta(event.delta)}` : ''}
        </li>)}</ul> : <p>无事件提交；世界修订未前进。</p>}
      </section>}
    </>}
      </div>
      {!!suggestions.length && <details className="cloud-game-suggestions"><summary>当前可尝试的行动</summary><div className="actions">{suggestions.map(item => <button className="secondary" key={item.id} disabled={busy} onClick={() => setText(item.text)}>{item.label}</button>)}</div></details>}
      {!!cache?.pending && <section className="card" aria-label="待核实行动"><p>{cache.pending.delivery === 'prepared' ? '行动已保存在本机，尚未开始发送。' : '行动发送过，是否完成需核对服务端回执。'}</p><button disabled={busy} onClick={() => void game.queryPending()}>查询行动结果</button><button disabled={busy} onClick={() => { if (window.confirm('使用原请求标识重试同一次行动，不创建新行动。继续吗？')) void game.submit(true); }}>使用原请求重试</button></section>}
      {save && <form className="intent-composer cloud-game-action" onSubmit={submit}>
        <label htmlFor="p2-action-input">你要做什么？</label>
        <textarea id="p2-action-input" data-testid="p2-action-input" value={text} maxLength={8_000} onChange={event => setText(event.target.value)} disabled={busy} />
        <button type="submit" className="primary" data-testid="p2-submit-action" disabled={busy || !!cache?.pending || !text.trim()}>{busy ? '正在结算…' : '提交行动'}</button>
      </form>}
      </div>
    </div>
    {showState && save && <GameInfoDialog label="存档状态" onClose={() => setShowState(false)}>
      <p>当前修订：{save.revision}</p><p>规则版本：<code>{save.ruleVersion}</code></p><p>世界设定版本：<code>{save.canonVersion}</code></p>
      <p>资料仅来自这份服务端存档；本页未提供人物记忆检索。</p>
    </GameInfoDialog>}
  </GameShell>;
}
