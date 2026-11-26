import {ISOLATED_PLAYTEST} from '../../playtest-channel';
import type { LocalSave } from '../../storage';
import { LiquidGlass } from '../../components/LiquidGlass';
import { MountainGateScene } from '../../scene';
import { ArmillaryRing, Seal } from '../../ui/Ornaments';
import { pickResumeSave } from '../../ui/resume';
import './landing-e.css';

type Props = { saves: LocalSave[]; onEnter: () => void; onReadSave: () => void; onContinue: (save: LocalSave) => void };

/** P01 · 首页：题字竖排于浑天环中，一个主入口，一个继续入口。 */
export function Landing({ saves, onEnter, onReadSave, onContinue }: Props) {
  const resume = pickResumeSave(saves);
  return <section className="hero">
    <div className="landing-copy">
      <div className="hero-title-group">
        <ArmillaryRing draw className="hero-armillary" />
        <div className="hero-lockup">
          <Seal size="lg" className="hero-seal" />
          <h1 className="hero-mark">九霄</h1>
        </div>
      </div>
      <div className="hero-entry">
        <p className="hero-verse">踏月过山门，<br />天地任君行。</p>
        <p className="hero-deck">东方修仙文字角色扮演。写下行动，探索九霄。</p>
        <div className="hero-actions">
          <LiquidGlass as="button" type="button" variant="clear" className="portal-enter liquid-glass--crystal" onClick={onEnter}><span>进入世界</span></LiquidGlass>
          {resume
            ? <LiquidGlass as="button" type="button" variant="clear" className="landing-read-save secondary liquid-glass--crystal" aria-describedby="landing-save-status" onClick={() => onContinue(resume)}>
                <span>继续上次行旅</span><small>{resume.name}{resume.location ? ` · ${resume.location}` : ''}</small>
              </LiquidGlass>
            : <LiquidGlass as="button" type="button" variant="clear" className="landing-read-save secondary liquid-glass--crystal" aria-label="读取存档" aria-describedby="landing-save-status" onClick={onReadSave}>
                <span>读取存档</span><small>当前没有旧档</small>
              </LiquidGlass>}
        </div>
        <p className="landing-status">
          {resume && <span id="landing-save-status">已有 {saves.length} 份本地存档</span>}
          {!resume && <span id="landing-save-status" hidden>当前没有本机存档</span>}
          <span className="landing-availability">{ISOLATED_PLAYTEST ? '隔离试玩：可体验已批准的开场行动。当前只提供游客测试，剧情与记忆仍在验收中。' : '当前公开体验：创建本地角色、保存行动草稿、探索世界资料。服务器剧情回合尚未开放。'}</span>
        </p>
        <nav className="landing-help" aria-label="初次体验"><a href="/intro">了解玩法</a><a href="/world">探索世界</a></nav>
      </div>
    </div>
    <MountainGateScene />
  </section>;
}
