import type { LocalSave } from '../../storage';
import { LiquidGlass } from '../../components/LiquidGlass';
import { MountainGateScene } from '../../scene';

type Props = { saves: LocalSave[]; onEnter: () => void; onReadSave: () => void };

export function Landing({ saves, onEnter, onReadSave }: Props) {
  return <section className="hero">
    <div className="landing-copy">
      <span className="eyebrow">月下山门</span>
      <h1 className="hero-mark">九霄</h1>
      <p className="hero-deck">修途自此启程。</p>
      <LiquidGlass as="button" type="button" variant="clear" className="portal-enter" onClick={onEnter}><span>进入世界</span></LiquidGlass>
      <LiquidGlass as="button" type="button" variant="clear" className="landing-read-save secondary" aria-label="读取存档" aria-describedby="landing-save-status" onClick={onReadSave}>
        <span>读取存档</span><small id="landing-save-status">{saves.length ? `已有 ${saves.length} 份本地存档` : '当前没有旧档'}</small>
      </LiquidGlass>
    </div>
    <MountainGateScene />
  </section>;
}
