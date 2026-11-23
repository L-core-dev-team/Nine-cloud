import { useNavigationCardAvailability } from './card-availability-cache';
import './ai-two-e.css';

/**
 * P09 · 两套 AI，互不通用 (JX-UI-E-01). Sits above the AI settings page, outside the
 * frozen professional editor subtree. It states where each model comes from and makes
 * no request of its own: whether the card library link is shown uses the last known
 * availability from the lobby.
 */
export function AiTwoModels({ onCards }: { onCards: () => void }) {
  const cardsAvailable = useNavigationCardAvailability(false);
  return <section className="jx-ai-two" aria-label="两套 AI 的区别">
    <dl>
      <div>
        <dt>原生《九霄》</dt>
        <dd>用本页为这台设备配置的模型。密钥只在本页临时使用。</dd>
      </div>
      <div>
        <dt>角色卡模式</dt>
        <dd>用服务器宿主配置的模型，不读取本页设置。宿主模型的实际状态显示在每段角色卡会话的顶部。</dd>
        {cardsAvailable && <dd><button type="button" className="quiet-action" onClick={onCards}>去角色卡资料库</button></dd>}
      </div>
    </dl>
  </section>;
}
