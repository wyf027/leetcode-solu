import React from 'react';
import { isDemo } from '../../config.js';
import { authorize } from '../../services/index.js';
import { LockKey } from '@phosphor-icons/react';
function AccessGate({ onAuthorized }) {
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    const authorizationCode = isDemo ? 'DEMO2026' : code.trim();
    if (authorizationCode.length < 6) {
      setError('请输入至少 6 位授权码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authorize(authorizationCode);
      await onAuthorized();
    } catch (error) {
      setError(error?.message || '授权码无效或已用完');
      setBusy(false);
    }
  };
  return (
    <div className="app-shell access-gate">
      <section className="access-gate__card">
        <div className="access-gate__brand">
          <img src="/assets/k-brand.png" alt="" />
          <strong>Kimi AI PPT</strong>
          <span className="brand-tagline">{isDemo ? 'React 独立演示' : 'AI 创作台'}</span>
        </div>
        <h1>{isDemo ? '体验你的 AI 创作台' : '输入授权码开始使用'}</h1>
        <p>
          {isDemo
            ? '体验选风格、上传参考资料、创建任务和下载预览。无需账号，也不会消耗真实额度。'
            : '授权码即入口，无需注册账号。额度与生成记录都跟着这张码走。'}
        </p>
        <form onSubmit={handleSubmit}>
          {!isDemo && (
            <>
              <label htmlFor="access-code">授权码</label>
              <input
                id="access-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setError('');
                }}
                placeholder="请输入授权码"
                autoComplete="one-time-code"
                autoFocus
                aria-describedby={error ? 'access-error' : undefined}
              />
            </>
          )}
          {error && (
            <span id="access-error" className="form-error" role="alert">
              {error}
            </span>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '正在进入…' : isDemo ? '进入演示创作台' : '进入创作台'}
          </button>
        </form>
        <div className="security-note">
          <LockKey size={18} weight="fill" />
          {isDemo ? '演示记录仅保存在当前浏览器' : '使用授权会话访问创作台'}
        </div>
      </section>
    </div>
  );
}
export { AccessGate };
