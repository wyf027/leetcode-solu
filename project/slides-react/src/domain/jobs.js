const TERMINAL_STATES = new Set(['succeeded', 'failed', 'canceled']);
const notifiedJobs = new Set();
const JOB_STATES = {
  queued: {
    label: '排队中',
    tone: 'wait',
  },
  running: {
    label: '生成中',
    tone: 'live',
  },
  succeeded: {
    label: '已完成',
    tone: 'ok',
  },
  failed: {
    label: '失败',
    tone: 'bad',
  },
  canceled: {
    label: '已取消',
    tone: 'off',
  },
};
function getJobStatus(job) {
  return (
    JOB_STATES[job?.state] ?? {
      label: job?.display_stage || job?.state || '处理中',
      tone: 'live',
    }
  );
}
function getJobProgress(job) {
  const percent = Number(job?.progress?.overall_percent);
  if (Number.isFinite(percent)) {
    return Math.max(0, Math.min(100, percent));
  }
  return 0;
}
function formatDate(timestamp) {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
  });
}
export { TERMINAL_STATES, notifiedJobs, JOB_STATES, getJobStatus, getJobProgress, formatDate };
