import { Component, type ReactNode } from 'react';

/** Keep navigation available when an optional route module cannot load. */
export class RouteModuleBoundary extends Component<{ children: ReactNode; onBack: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="page" role="alert">
      <h2>页面暂时无法打开</h2>
      <p>请检查连接后重新载入。刷新可能丢失本页尚未保存的修改。</p>
      <div className="actions"><button className="secondary" onClick={this.props.onBack}>返回山门</button><button className="primary" onClick={() => window.location.reload()}>重新载入页面</button></div>
    </section>;
  }
}
