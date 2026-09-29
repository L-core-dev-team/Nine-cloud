import { useEffect, useState } from 'react';
import { SCENE_MANIFEST, type SceneId } from '@jiuxiao/content/scenes';
import { detectRendererEnvironment, type GraphicsSettings } from '../graphics-settings';
import type { SceneRenderStatus } from '../scenes/SceneAtmosphere';

type Props = {
  settings: GraphicsSettings;
  onChange: (settings: GraphicsSettings) => void;
  renderer: SceneRenderStatus | null;
  ambientAudioActive: boolean;
  onToggleAmbientAudio: () => void;
  onPreviewScene: (scene: SceneId | null) => void;
};

const qualityChoices = [
  ['auto', '自适应', '按浏览器图形能力选择基础画质。'],
  ['cinematic', '电影光影', '增加雾层与微光密度；此名称描述本地效果档，不代表游戏级光追。'],
  ['extreme', '极致', '提高渲染比例上限与粒子数量；耗电和发热可能上升。'],
  ['high', '高清', '保留较细的场景层，适合较新的桌面或移动设备。'],
  ['balanced', '均衡', '在动态效果、发热和功耗之间折中。'],
  ['economy', '省电', '降低画面比例、雾层与粒子密度。'],
  ['standard', '标清', '最低负载；弱网络或较旧设备可用。'],
] as const;

export function GraphicsSettingsPage({ settings, onChange, renderer, ambientAudioActive, onToggleAmbientAudio, onPreviewScene }: Props) {
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<SceneId>('mountain-gate');

  useEffect(() => {
    setBackendAvailable(detectRendererEnvironment().webglAvailable);
    return () => onPreviewScene(null);
  }, [onPreviewScene]);

  const patch = (change: Partial<GraphicsSettings>) => onChange({ ...settings, ...change });
  const currentBackend = renderer?.backend ?? (backendAvailable === null ? '检测中' : backendAvailable ? 'WebGL 可用' : '静态回退');
  const measured = renderer?.fps === null || renderer?.fps === undefined ? '等待采样' : `${renderer.fps} FPS`;
  const actualScale = renderer ? `${Math.round(renderer.renderScale * 100)}%` : '—';

  return <section className="page graphics-page">
    <span className="eyebrow">画面与声音</span>
    <h2>山河光景</h2>
    <p className="graphics-lede">选择适合这台设备的场景表现。档位只调整本地渲染负载；浏览器、显示器和温度仍会影响实际帧率。</p>

    <section className="graphics-section" aria-labelledby="scene-preview-title">
      <div className="graphics-section-heading"><div><span className="graphics-kicker">场景试览</span><h3 id="scene-preview-title">山门之外，尚有天地</h3></div><span className="graphics-status">固定素材 ID · 不接受外部地址</span></div>
      <div className="scene-choice-list" role="group" aria-label="预览场景">
        {SCENE_MANIFEST.map(scene => <button key={scene.id} className="scene-choice" aria-pressed={preview === scene.id} onClick={() => { setPreview(scene.id); onPreviewScene(scene.id); }}>
          <strong>{scene.name}</strong>
          <small>{scene.assetStatus === 'candidate-internal' ? '项目候选画面 · 来源与发布授权待核' : '程序化预览 · 正式画面待审核'}</small>
        </button>)}
      </div>
      <p className="quiet-note">候选画面已按四类固定场景接入预览。游戏内只按已结算地点切换；玩家输入和模型不能指定图片网址。来源、授权和双作者发布审核完成前，这些文件只作内部预览。</p>
    </section>

    <section className="graphics-section" aria-labelledby="quality-title">
      <div className="graphics-section-heading"><div><span className="graphics-kicker">图形质量</span><h3 id="quality-title">调校画面</h3></div><span className="graphics-status">当前后端：{currentBackend}</span></div>
      <label className="graphics-field">画质档位
        <select value={settings.quality} onChange={event => patch({ quality: event.target.value as GraphicsSettings['quality'] })}>
          {qualityChoices.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      </label>
      <div className="quality-description">{qualityChoices.find(([value]) => value === settings.quality)?.[2]}</div>

      <label className="graphics-field frame-control">场景帧率目标 <span>{settings.dataSaver ? '省电上限 30 FPS' : `≤ ${settings.targetFps} FPS`}</span>
        <input aria-label="场景帧率目标" type="range" min="30" max="120" step="30" value={settings.targetFps} disabled={settings.dataSaver} onChange={event => patch({ targetFps: Number(event.target.value) as GraphicsSettings['targetFps'] })} />
        <span className="range-markers"><span>30</span><span>60</span><span>90</span><span>120</span></span>
      </label>
      <label className="graphics-field frame-control">渲染比例 <span>{settings.renderScale}%</span>
        <input aria-label="渲染比例" type="range" min="50" max="135" step="5" value={settings.renderScale} onChange={event => patch({ renderScale: Number(event.target.value) })} />
        <span className="range-markers"><span>50%</span><span>100%</span><span>135%</span></span>
      </label>

      <div className="graphics-toggle-grid">
        <label className="graphics-toggle"><input type="checkbox" checked={settings.dynamicResolution} onChange={event => patch({ dynamicResolution: event.target.checked })} /><span><strong>自适应渲染比例</strong><small>根据场景帧间隔在设定范围内缓慢调整；采样不等同于 GPU 计时器。</small></span></label>
        <label className="graphics-toggle"><input type="checkbox" checked={settings.atmosphereEnabled} onChange={event => patch({ atmosphereEnabled: event.target.checked })} /><span><strong>雾与水光</strong><small>山门水面反光及全站氛围雾层。</small></span></label>
        <label className="graphics-toggle"><input type="checkbox" checked={settings.particlesEnabled} onChange={event => patch({ particlesEnabled: event.target.checked })} /><span><strong>浮尘与灵火</strong><small>按场景采用冷光微尘或暖色微粒。</small></span></label>
        <label className="graphics-toggle"><input type="checkbox" checked={settings.dataSaver} onChange={event => patch({ dataSaver: event.target.checked })} /><span><strong>省电 / 省流量</strong><small>氛围层目标 30 FPS、关闭粒子并冻结装饰动效；场景图使用本地文件。</small></span></label>
        <label className="graphics-toggle"><input type="checkbox" checked={settings.sceneVideoEnabled} disabled={settings.dataSaver || settings.reducedMotion} onChange={event => patch({ sceneVideoEnabled: event.target.checked })} /><span><strong>短循环场景影像</strong><small>山门横屏与妖林竖屏可播放静音循环；约 1.5 MB，省流量、减少动态效果或浏览器不支持时保留静态画面。</small></span></label>
        <label className="graphics-toggle"><input type="checkbox" checked={settings.reducedMotion} onChange={event => patch({ reducedMotion: event.target.checked })} /><span><strong>减少动态效果</strong><small>保留静态画面；同时尊重系统的减少动态效果设置。</small></span></label>
      </div>
      <div className="renderer-readout" aria-live="polite"><span>场景采样</span><strong>{measured}</strong><span>有效渲染比例</span><strong>{actualScale}</strong><span>档位目标</span><strong>{settings.dataSaver ? '30 FPS' : `${settings.targetFps} FPS`}</strong></div>
      <p className="quiet-note">当前使用 WebGL / Canvas 绘制局部氛围层。浏览器暂不启用实时光追、WebGI、神经渲染或 AI 超分；设备支持某项技术不代表本项目已经集成或通过性能验证。</p>
    </section>

    <section className="graphics-section audio-section" aria-labelledby="audio-title">
      <div className="graphics-section-heading"><div><span className="graphics-kicker">环境声</span><h3 id="audio-title">听水入山</h3></div><span className="graphics-status">{ambientAudioActive ? '正在播放' : '默认静音'}</span></div>
      <p>声音只在你点击后播放。现阶段使用本机合成的流水氛围，尚未替代作者审核后的实录水声。</p>
      <label className="graphics-field">音量 <span>{settings.ambienceVolume}%</span>
        <input aria-label="环境声音量" type="range" min="0" max="80" step="1" value={settings.ambienceVolume} onChange={event => patch({ ambienceVolume: Number(event.target.value) })} />
      </label>
      <button className={ambientAudioActive ? 'secondary graphics-audio-button' : 'primary graphics-audio-button'} onClick={onToggleAmbientAudio}>{ambientAudioActive ? '停下水声' : '启用水声'}</button>
    </section>
  </section>;
}
