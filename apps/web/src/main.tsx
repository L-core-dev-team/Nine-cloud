import React from 'react';
import { createRoot } from 'react-dom/client';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';
import './style.css';

function App() {
  return <main className="preview">
    <span className="eyebrow">九霄 / 1.0 工程预览</span>
    <h1>山门尚未开启</h1>
    <p>当前版本只验证新工作区、构建和存档契约。旧版游戏仍可在历史发布物中运行。</p>
    <p className="detail">存档契约版本 {SAVE_SCHEMA_VERSION} · 玩家流程将在下一阶段迁入。</p>
  </main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
