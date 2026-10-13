import { LiquidGlass } from './LiquidGlass';

type Props = {
  showNavigation: boolean;
  theme: 'night' | 'day';
  menuOpen: boolean;
  ambientAudioActive: boolean;
  onNavigate: (path: string) => void;
  onThemeChange: () => void;
  onToggleMenu: () => void;
  onToggleAmbientAudio: () => void;
};

/** Functional glass is shared by the toolbar; its items remain thin overlays. */
export function GlassHeader({ showNavigation, theme, menuOpen, ambientAudioActive, onNavigate, onThemeChange, onToggleMenu, onToggleAmbientAudio }: Props) {
  const themeLabel = theme === 'night' ? '夜色' : '晴昼';
  const nextThemeLabel = theme === 'night' ? '晴昼' : '夜色';
  return <LiquidGlass as="header" variant="regular">
    <button className="brand" onClick={() => onNavigate('/')}>踏月过山门，天地任君行。</button>
    {showNavigation && <nav>
      <button onClick={() => onNavigate('/lobby')}>山门</button>
      <button onClick={() => onNavigate('/world')}>世界设定</button>
      <button onClick={() => onNavigate('/settings/ai')}>AI 设置</button>
      <button onClick={() => onNavigate('/settings/graphics')}>画面与声音</button>
      <button onClick={() => onNavigate('/settings/cloud')}>账号与云档</button>
    </nav>}
    <div className="header-tools">
      <button className={`ambient-toggle${ambientAudioActive ? ' is-active' : ''}`} aria-pressed={ambientAudioActive} onClick={onToggleAmbientAudio}>{ambientAudioActive ? '水声已启' : '启水声'}</button>
      <button className="theme-toggle" aria-label={`切换到${nextThemeLabel}配色`} onClick={onThemeChange}>{themeLabel}</button>
      <button className="menu" aria-expanded={menuOpen} onClick={onToggleMenu}>菜单</button>
    </div>
  </LiquidGlass>;
}
