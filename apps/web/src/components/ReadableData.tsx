const labels: Record<string, string> = { name: '姓名', age: '年龄', personality: '性格', origin: '身份', realm: '修为', root: '灵根', appearance: '外貌', talents: '天赋', goal: '目标', region: '地域', note: '记述', hp: '生命', mp: '灵力', stamina: '体力', level: '等级', location: '地点', items: '物品', quests: '任务', content: '内容', text: '正文', summary: '摘要', title: '标题', status: '状态', relationships: '人物关系', createdAt: '记录时间', updatedAt: '更新时间' };

import type { ReactNode } from 'react';

// One budget applies to the entire tree, not independently to every branch.
// The original archive is never truncated by this display component.
function renderValue(value: unknown, depth: number, budget: { remaining: number }): ReactNode {
  if (budget.remaining-- <= 0) return null;
  if (value == null || value === '') return <span className="data-empty">尚未记录</span>;
  if (typeof value === 'string') return <p className="data-prose">{value.slice(0, 12000)}{value.length > 12000 ? '（完整内容保留在存档中）' : ''}</p>;
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{typeof value === 'boolean' ? value ? '是' : '否' : String(value)}</span>;
  if (depth >= 6) return <span className="data-empty">更多层级保留在历史资料与存档中。</span>;
  if (Array.isArray(value)) return value.length ? <><ol className="data-list">{value.slice(0, 50).map((item, index) => budget.remaining > 0 ? <li key={index}>{renderValue(item, depth + 1, budget)}</li> : null)}</ol>{value.length > 50 && <p className="data-empty">此处显示前 50 项；完整内容可从存档导出。</p>}</> : <span className="data-empty">暂无记录</span>;
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? <><dl className="readable-data">{entries.slice(0, 50).map(([key, item]) => budget.remaining > 0 ? <div key={key}><dt>{(labels[key] ?? key).slice(0, 200)}</dt><dd>{renderValue(item, depth + 1, budget)}</dd></div> : null)}</dl>{entries.length > 50 && <p className="data-empty">其余字段保留在存档中。</p>}</> : <span className="data-empty">暂无记录</span>;
  }
  return <span className="data-empty">此项暂无法展示，请查看导出存档。</span>;
}

export function ReadableData({ value }: { value: unknown }) {
  const budget = { remaining: 250 };
  const content = renderValue(value, 0, budget);
  return <>{content}{budget.remaining <= 0 && <p className="data-empty">资料较多，此处仅显示部分内容；完整内容保留在存档中。</p>}</>;
}
