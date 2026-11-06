import React from 'react';
import { isDemo } from '../../config.js';
import { redeemCode } from '../../services/index.js';
import { Modal } from '../common/Modal.jsx';
import { LockKey, X } from '@phosphor-icons/react';
import { SurfaceIcon } from '../common/SurfaceIcon.jsx';
function LongPageDialog({ onClose, onAuthorized }) {
  const [code, setCode] = React.useState(isDemo ? 'DEMO2026' : '');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    const authorizationCode = code.trim();
    if (authorizationCode.length < 6) {
      setError('请输入至少 6 位授权码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await redeemCode(authorizationCode);
      await onAuthorized();
    } catch (error) {
      setError(error?.message || '验证失败，请确认授权码是否正确');
      setBusy(false);
    }
  };
  return (
    <Modal
      titleId="long-page-modal-title"
      onClose={onClose}
      className="compact-modal long-page-modal"
    >
      <button
        className="icon-button modal-close compact-modal__close"
        type="button"
        onClick={onClose}
        aria-label="关闭长篇页数授权"
      >
        <X size={22} />
      </button>
      <SurfaceIcon>
        <LockKey size={24} weight="fill" />
      </SurfaceIcon>
      <h2 id="long-page-modal-title">解锁 31–60 页</h2>
      <p>长篇演示需要单独授权。请输入长篇授权码，验证成功后将自动选择 31–60 页。</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="long-page-code">长篇授权码</label>
        <input
          id="long-page-code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError('');
          }}
          placeholder="请输入长篇授权码"
          autoComplete="one-time-code"
          autoFocus
          aria-describedby={error ? 'long-page-error' : 'long-page-help'}
        />
        <span id="long-page-help" className="form-help">
          此授权仅解锁长篇页数，不增加生成额度
        </span>
        {error && (
          <span id="long-page-error" className="form-error" role="alert">
            {error}
          </span>
        )}
        <div className="compact-modal__actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '验证中…' : '验证并解锁'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export { LongPageDialog };
