import { Modal } from '../common/Modal.jsx';
import { isDemo } from '../../config.js';
import { CheckCircle, Files, Lightning, LockKey, X } from '@phosphor-icons/react';
import { SurfaceIcon } from '../common/SurfaceIcon.jsx';
function ConfirmDialog({
  stage,
  sourceLabel,
  pageConfirmation,
  consumptionCopy,
  fileCount,
  deliverableLabel = 'PPT',
  onClose,
  onConfirm,
  onViewProgress,
}) {
  const consumptionNotice = `${isDemo ? '本次模拟消耗' : '本次扣除'} ${consumptionCopy.replace(' · ', ' ')}`;
  return (
    <Modal
      titleId="generate-modal-title"
      onClose={stage === 'loading' ? () => {} : onClose}
      className="compact-modal generate-modal"
    >
      {stage === 'confirm' && (
        <>
          <button
            className="icon-button modal-close compact-modal__close"
            type="button"
            onClick={onClose}
            aria-label="关闭生成确认"
          >
            <X size={22} />
          </button>
          <SurfaceIcon>
            <Lightning size={25} weight="fill" />
          </SurfaceIcon>
          <h2 id="generate-modal-title">
            {isDemo ? '准备开始演示任务' : `准备生成 ${deliverableLabel}`}
          </h2>
          <p>
            将使用“{sourceLabel}”生成 {deliverableLabel}；
            {deliverableLabel === 'PPT' ? pageConfirmation + '；' : ''}
            {consumptionNotice}。
          </p>
          <div className="confirm-facts">
            <span>
              <Files size={17} />
              {fileCount} 个参考文件
            </span>
            <span>
              <LockKey size={17} />
              {isDemo ? '本地模拟，无真实扣费' : '授权会话'}
            </span>
          </div>
          <div className="compact-modal__actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              返回修改
            </button>
            <button className="primary-button" type="button" onClick={onConfirm}>
              确认生成
            </button>
          </div>
        </>
      )}
      {stage === 'loading' && (
        <div className="progress-state">
          <span className="spinner" aria-hidden="true" />
          <h2 id="generate-modal-title">正在组织内容与版式</h2>
          <p>{isDemo ? '正在创建本地演示记录…' : '正在提交生成任务…'}</p>
        </div>
      )}
      {stage === 'success' && (
        <div className="success-state">
          <CheckCircle size={52} weight="fill" aria-hidden="true" />
          <h2 id="generate-modal-title">
            {isDemo ? '演示任务已开始' : `${deliverableLabel} 已开始生成`}
          </h2>
          <p>任务已进入队列。可以就在这里盯着进度，也可以稍后从「任务历史」回来取。</p>
          <div className="compact-modal__actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              知道了
            </button>
            <button className="primary-button" type="button" onClick={onViewProgress}>
              查看进度
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
export { ConfirmDialog };
