import { useEffect, useRef, useState } from 'react';
import { fetchAvailableModels, type AvailableModel } from '../ai-model-list';
import type { ProtocolId } from '../ai-protocols';

export function ModelPicker({ protocol, baseUrl, apiKey, model, onSelect }: { protocol: ProtocolId; baseUrl: string; apiKey: string; model: string; onSelect: (id: string) => void }) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    requestRef.current?.abort(); requestRef.current = null;
    setModels([]); setStatus(''); setLoading(false);
    return () => { requestRef.current?.abort(); requestRef.current = null; };
  }, [protocol, baseUrl, apiKey]);
  async function load() {
    if (requestRef.current) return;
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setStatus('正在读取当前接口的型号列表…'); setModels([]);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const list = await fetchAvailableModels(protocol, baseUrl, apiKey, controller.signal);
      if (requestRef.current !== controller) return;
      setModels(list); setStatus(list.length ? `收到 ${list.length} 个型号。型号可见不代表当前协议一定支持生成。` : '接口未列出可选型号，仍可手动填写。');
    } catch (reason) {
      if (requestRef.current !== controller) return;
      // Network/browser exceptions can contain URLs. Do not display raw exceptions.
      setStatus(controller.signal.aborted ? '读取已取消或超过 15 秒。可以重试或手动填写。' : reason instanceof Error && reason.message.startsWith('型号列表返回 HTTP') ? reason.message : '无法读取型号列表。请核对地址、权限与浏览器跨域限制；仍可手动填写。');
    } finally { clearTimeout(timer); if (requestRef.current === controller) { requestRef.current = null; setLoading(false); } }
  }
  return <div className="model-picker">
    <div className="connection-row"><button className="secondary" type="button" disabled={loading || !baseUrl.trim()} onClick={() => void load()}>读取可用型号</button>{loading && <button className="quiet-action" type="button" onClick={() => requestRef.current?.abort()}>取消读取</button>}</div>
    <small>点击后向所填接口发送列表请求，使用本岗位密钥；不生成剧情。接口不支持列表时，可直接填写 Model ID。</small>
    {models.length > 0 && <label className="setting-field">当前接口返回的型号<select aria-label="选择接口型号" value={models.some(item => item.id === model) ? model : ''} onChange={event => { if (event.target.value) onSelect(event.target.value); }}><option value="">选择型号（保留手动输入）</option>{models.map(item => <option key={item.id} value={item.id}>{item.id}{item.name !== item.id ? ` · ${item.name}` : ''}</option>)}</select></label>}
    <p className="quiet-note" role="status">{status}</p>
  </div>;
}
