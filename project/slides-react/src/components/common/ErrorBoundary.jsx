import React from 'react';
export class ErrorBoundary extends React.Component {
  state = {
    failed: false,
  };
  static getDerivedStateFromError() {
    return {
      failed: true,
    };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>页面暂时无法显示</h1>
          <p>请刷新后重试，或用“重置演示”清理当前浏览器的演示记录。</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </main>
      );
    return this.props.children;
  }
}
