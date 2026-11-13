import React from 'react';
import {
  TERMINAL_STATES,
  formatDate,
  getJobProgress,
  getJobStatus,
  notifiedJobs,
} from '../../domain/jobs.js';
import { cancelJob, downloadArtifact, getJob, subscribeJob } from '../../services/index.js';
import { Modal } from '../common/Modal.jsx';
import { isDemo } from '../../config.js';
import { DownloadSimple, FilePpt, Prohibit, Warning, X } from '@phosphor-icons/react';
function JobProgressDialog({ job, onClose, onChanged }) {
  const [currentJob, setCurrentJob] = React.useState(job);
  const [pendingAction, setPendingAction] = React.useState('');
  const [error, setError] = React.useState('');
  const jobId = job?.job_id;
  React.useEffect(() => {
    if (!jobId || TERMINAL_STATES.has(job?.state) || TERMINAL_STATES.has(currentJob?.state)) {
      return;
    }
    let isActive = true;
    let pollTimer = 0;
    let unsubscribe = () => {};
    const stopUpdates = () => {
      window.clearInterval(pollTimer);
      unsubscribe();
    };
    const refreshJob = async () => {
      try {
        const latestJob = await getJob(jobId);
        if (!isActive) {
          return;
        }
        setCurrentJob(latestJob);
        if (TERMINAL_STATES.has(latestJob?.state)) {
          stopUpdates();
          if (!notifiedJobs.has(jobId)) {
            notifiedJobs.add(jobId);
            if (onChanged != null) {
              onChanged();
            }
          }
        }
      } catch {}
    };
    unsubscribe = subscribeJob(jobId, {
      onEvent: (event) => {
        if (!isActive) return;
        setCurrentJob((previousJob) => {
          const nextPercent = Number(event.progress?.overall_percent);
          const previousPercent = Number(previousJob?.progress?.overall_percent);
          const progress =
            Number.isFinite(nextPercent) &&
            (!Number.isFinite(previousPercent) || nextPercent >= previousPercent)
              ? event.progress
              : previousJob?.progress;
          return {
            ...previousJob,
            progress,
            stage: event.stage ?? previousJob?.stage,
            status_message:
              progress === event.progress
                ? (event.data?.status_message ?? previousJob?.status_message)
                : previousJob?.status_message,
          };
        });
        if (String(event.type || '').startsWith('job.')) {
          const eventState = String(event.type).slice(4);
          if (TERMINAL_STATES.has(eventState)) {
            refreshJob();
          }
        }
      },
    });
    pollTimer = window.setInterval(refreshJob, 15000);
    refreshJob();
    return () => {
      isActive = false;
      stopUpdates();
    };
  }, [jobId, job?.state, onChanged]);
  const status = getJobStatus(currentJob);
  const progress = getJobProgress(currentJob);
  const artifact = currentJob?.artifact;
  const canDownload = currentJob?.state === 'succeeded' && artifact?.artifact_id;
  const handleDownload = async () => {
    setPendingAction('download');
    setError('');
    try {
      await downloadArtifact(artifact.artifact_id);
    } catch (error) {
      setError(error?.message || '下载失败，请重试');
    } finally {
      setPendingAction('');
    }
  };
  const handleCancel = async () => {
    if (
      window.confirm(
        isDemo ? '取消演示任务？模拟额度会退回。' : '取消这次生成？已经消耗的额度按后端规则退回。',
      )
    ) {
      setPendingAction('cancel');
      setError('');
      try {
        await cancelJob(jobId);
        const updatedJob = await getJob(jobId);
        setCurrentJob(updatedJob);
        onChanged?.();
      } catch (error) {
        setError(error?.message || '取消失败');
      } finally {
        setPendingAction('');
      }
    }
  };
  return (
    <Modal titleId="job-progress-title" onClose={onClose} className="job-modal">
      <header className="job-modal__header">
        <div>
          <h2 id="job-progress-title">{currentJob?.requested?.topic || '生成任务'}</h2>
          <p>
            <span className={`job-state job-state--${status.tone}`}>{status.label}</span>
            {currentJob?.requested?.style_name && <>　{currentJob.requested.style_name}</>}
            {currentJob?.created_at && <>　{formatDate(currentJob.created_at)}</>}
          </p>
        </div>
        <button
          className="icon-button modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭任务详情"
        >
          <X size={24} />
        </button>
      </header>
      <div className="job-modal__body">
        <div
          className="job-progress"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className={`job-progress__bar job-progress__bar--${status.tone}`}
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
        <div className="job-progress__meta">
          <strong>
            {progress > 0 && progress < 100 ? progress.toFixed(1) : progress.toFixed(0)}%
          </strong>
          <span>{currentJob?.status_message || currentJob?.display_stage || '正在处理'}</span>
        </div>
        {currentJob?.state === 'failed' && (
          <div className="job-alert job-alert--bad">
            <Warning size={18} weight="fill" />
            <span>{currentJob?.failure?.message || '生成失败，可重新下单'}</span>
          </div>
        )}
        {canDownload && (
          <div className="job-artifact">
            <FilePpt size={30} weight="fill" />
            <div>
              <strong>{artifact.filename}</strong>
              <span>
                {artifact.page_count} 页
                {artifact.artifact_expires_at && (
                  <>　{formatDate(artifact.artifact_expires_at)} 前有效</>
                )}
              </span>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={handleDownload}
              disabled={pendingAction === 'download'}
            >
              <DownloadSimple size={18} weight="bold" />
              {pendingAction === 'download' ? '准备中…' : '下载成品'}
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <div className="modal-selection">
          <span>任务编号</span>
          <strong className="mono">{jobId}</strong>
        </div>
        {currentJob?.can_cancel && !TERMINAL_STATES.has(currentJob?.state) && (
          <button
            className="secondary-button"
            type="button"
            onClick={handleCancel}
            disabled={pendingAction === 'cancel'}
          >
            <Prohibit size={17} />
            {pendingAction === 'cancel' ? '取消中…' : '取消生成'}
          </button>
        )}
        <button className="primary-button modal-confirm" type="button" onClick={onClose}>
          知道了
        </button>
      </footer>
    </Modal>
  );
}
export { JobProgressDialog };
