import { LiquidGlass } from './LiquidGlass';
import { Seal } from '../ui/Ornaments';

type Props = {
  showNavigation: boolean;
  theme: 'night' | 'day';
  menuOpen: boolean;
  ambientAudioActive: boolean;
  currentRoute: string;
  cardsAvailable: boolean;
  onNavigate: (path: string) => void;
  onThemeChange: () => void;
  onToggleMenu: () => void;
  onToggleAmbientAudio: () => void;
};

/** Primary destinations shared by the header and the mobile bottom navigation (G00). */
export function primaryDestinations(cardsAvailable: boolean): { path: string; label: string; short: string }[] {
  return [
    { path: '/lobby', label: '大厅', short: '大厅' },
    ...(cardsAvailable ? [{ path: '/cards', label: '角色卡', short: '角色卡' }] : []),
    { path: '/world', label: '世界设定', short: '世界' },
    { path: '/saves', label: '档案', short: '档案' },
  ];
}

export function isCurrentDestination(path: string, currentRoute: string): boolean {
  if (path === '/cards') return currentRoute === '/cards' || currentRoute.startsWith('/cards/');
  return currentRoute === path;
}

/** Functional glass is shared by the toolbar; its items remain thin overlays. */
export function GlassHeader({ showNavigation, theme, menuOpen, ambientAudioActive, currentRoute, cardsAvailable, onNavigate, onThemeChange, onToggleMenu, onToggleAmbientAudio }: Props) {
  const themeLabel = theme === 'night' ? '夜色' : '晴昼';
  const nextThemeLabel = theme === 'night' ? '晴昼' : '夜色';
  return <LiquidGlass as="header" variant="regular">
    <button className="brand" aria-label="九霄首页" onClick={() => onNavigate('/')}><Seal /><span className="brand-word">九霄</span></button>
    {showNavigation && <nav aria-label="主要去处">
      {primaryDestinations(cardsAvailable).map(item => <button key={item.path} aria-current={isCurrentDestination(item.path, currentRoute) ? 'page' : undefined} onClick={() => onNavigate(item.path)}>{item.label}</button>)}
    </nav>}
    <div className="header-tools">
      <button className={`ambient-toggle${ambientAudioActive ? ' is-active' : ''}`} aria-pressed={ambientAudioActive} onClick={onToggleAmbientAudio}>{ambientAudioActive ? '水声已启' : '启水声'}</button>
      <button className="theme-toggle" aria-label={`切换到${nextThemeLabel}配色`} onClick={onThemeChange}>{themeLabel}</button>
      <button className="menu" aria-expanded={menuOpen} onClick={onToggleMenu}>菜单</button>
    </div>
  </LiquidGlass>;
}
