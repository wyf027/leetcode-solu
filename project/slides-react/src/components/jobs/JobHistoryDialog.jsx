import React from 'react';
import { isDemo } from '../../config.js';
import { getJobs } from '../../services/index.js';
import { Modal } from '../common/Modal.jsx';
import { ArrowClockwise, CheckCircle, FilePpt, X } from '@phosphor-icons/react';
import { formatDate, getJobStatus } from '../../domain/jobs.js';
function JobHistoryDialog({ onClose, onOpenJob }) {
  const [history, setHistory] = React.useState(null);
  const [error, setError] = React.useState('');
  const loadHistory = async () => {
    setError('');
    try {
      const response = await getJobs();
      setHistory(response?.items ?? []);
    } catch (error) {
      setError(error?.message || '加载失败');
      setHistory([]);
    }
  };
  React.useEffect(() => {
    loadHistory();
  }, []);
  return (
    <Modal titleId="history-title" onClose={onClose} className="history-modal">
      <header className="file-manager__header">
        <div>
          <h2 id="history-title">任务历史</h2>
          <p>
            {history === null
              ? '正在加载…'
              : `共 ${history.length} 个任务${isDemo ? '，本浏览器保留最近 50 条记录' : ''}`}
          </p>
        </div>
        <button
          className="icon-button modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭任务历史"
        >
          <X size={24} />
        </button>
      </header>
      <div className="file-manager__body">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {history !== null && history.length === 0 && !error && (
          <div className="style-empty">
            <FilePpt size={28} />
            <strong>还没有生成记录</strong>
            <span>回到创作台开始第一份演示</span>
          </div>
        )}
        <ul className="history-list">
          {(history ?? []).map((job) => {
            const status = getJobStatus(job);
            return (
              <li key={job.job_id}>
                <button type="button" className="history-row" onClick={() => onOpenJob(job)}>
                  <span className={`job-state job-state--${status.tone}`}>{status.label}</span>
                  <span className="history-row__copy">
                    <strong>{job.requested?.topic || job.job_id}</strong>
                    <span>
                      {job.requested?.style_name || '—'}
                      {formatDate(job.created_at)}
                    </span>
                  </span>
                  {job.state === 'succeeded' ? (
                    <CheckCircle size={20} weight="fill" />
                  ) : (
                    <ArrowClockwise size={18} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="file-manager__footer">
        <span>点任意一条可以查看进度或下载成品</span>
        <button className="primary-button" type="button" onClick={onClose}>
          完成
        </button>
      </footer>
    </Modal>
  );
}
export { JobHistoryDialog };
