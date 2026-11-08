import type { LocalSave } from '../../storage';
import { LiquidGlass } from '../../components/LiquidGlass';
import { MountainGateScene } from '../../scene';

type Props = { saves: LocalSave[]; onEnter: () => void; onReadSave: () => void };

export function Landing({ saves, onEnter, onReadSave }: Props) {
  return <section className="hero">
    <div className="landing-copy">
      <span className="eyebrow">月下山门</span>
      <h1 className="hero-mark">九霄</h1>
      <p className="hero-deck">东方修仙文字角色扮演 · 写下行动，探索九霄。</p>
      <LiquidGlass as="button" type="button" variant="clear" className="portal-enter liquid-glass--crystal" onClick={onEnter}><span>进入世界</span></LiquidGlass>
      <LiquidGlass as="button" type="button" variant="clear" className="landing-read-save secondary liquid-glass--crystal" aria-label="读取存档" aria-describedby="landing-save-status" onClick={onReadSave}>
        <span>读取存档</span><small id="landing-save-status">{saves.length ? `已有 ${saves.length} 份本地存档` : '当前没有旧档'}</small>
      </LiquidGlass>
      <p className="landing-availability">当前公开体验：创建本地角色、保存行动草稿、探索世界资料。服务器剧情回合尚未开放。</p>
      <nav className="landing-help" aria-label="初次体验"><a href="/intro">了解玩法</a><a href="/world">探索世界</a></nav>
    </div>
    <MountainGateScene />
  </section>;
}
