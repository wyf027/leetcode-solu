import React from 'react';
import { isDemo } from '../../config.js';
import { redeemCode } from '../../services/index.js';
import { Modal } from '../common/Modal.jsx';
import { Plus, X } from '@phosphor-icons/react';
import { SurfaceIcon } from '../common/SurfaceIcon.jsx';
function RedeemDialog({ onClose, onAdded }) {
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
      await onAdded();
    } catch (error) {
      setError(error?.message || '验证失败，请确认授权码是否正确');
      setBusy(false);
    }
  };
  return (
    <Modal titleId="quota-modal-title" onClose={onClose} className="compact-modal">
      <button
        className="icon-button modal-close compact-modal__close"
        type="button"
        onClick={onClose}
        aria-label="关闭添加额度"
      >
        <X size={22} />
      </button>
      <SurfaceIcon>
        <Plus size={24} />
      </SurfaceIcon>
      <h2 id="quota-modal-title">添加生成额度</h2>
      <p>
        {isDemo
          ? '使用 DEMO2026 补充模拟额度，不会兑换或消耗原站授权码。'
          : '仅在这里输入授权码。验证后额度会立即加入当前授权会话。'}
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="quota-code">授权码</label>
        <input
          id="quota-code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError('');
          }}
          placeholder="请输入授权码"
          autoFocus
          aria-describedby={error ? 'quota-error' : undefined}
        />
        {error && (
          <span id="quota-error" className="form-error">
            {error}
          </span>
        )}
        <div className="compact-modal__actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '验证中…' : '验证并添加'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export { RedeemDialog };
