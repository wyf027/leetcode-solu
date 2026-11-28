import { ApiError } from './http.js';
import { demoStyles, freeStyle } from '../demo/styles.js';
import { demoId, readDemoState, resetDemoState, saveDemoState } from '../demo/storage.js';
import { downloadDemoJob } from '../demo/download.js';

const error = (message, status = 400) =>
  new ApiError({
    code: status === 401 ? 'UNAUTHENTICATED' : 'DEMO_ERROR',
    message,
    status,
    retryable: false,
  });
const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
function sessionState() {
  const state = readDemoState();
  if (!state.authenticated) throw error('请先进入演示创作台', 401);
  return state;
}

function advanceJob(job, now = Date.now()) {
  if (['succeeded', 'canceled', 'failed'].includes(job.state)) return job;
  const elapsed = now - Date.parse(job.created_at);
  const percent = Math.max(0, Math.min(100, Math.floor(elapsed / 120)));
  const state = percent >= 100 ? 'succeeded' : elapsed < 1500 ? 'queued' : 'running';
  const status_message =
    state === 'succeeded'
      ? '演示已完成，可下载 HTML 预览'
      : state === 'queued'
        ? '演示任务排队中'
        : percent < 45
          ? '正在模拟内容组织…'
          : '正在模拟版式生成…';
  return {
    ...job,
    state,
    status_message,
    display_stage: status_message,
    progress: { overall_percent: percent },
    can_cancel: state !== 'succeeded',
    ...(state === 'succeeded'
      ? {
          artifact: {
            artifact_id: `artifact-${job.job_id}`,
            filename: `${job.requested.topic.replace(/[\\/:*?"<>|]/g, '_').slice(0, 70)}.demo.html`,
            page_count: 3,
          },
        }
      : {}),
  };
}

export async function authorize(code) {
  if (code !== 'DEMO2026') throw error('演示模式无需原站授权码，请使用“进入演示创作台”');
  const state = readDemoState();
  state.authenticated = true;
  saveDemoState(state);
  return getSession();
}
export async function getSession() {
  sessionState();
  return { session_id: 'local-demo', demo: true, permissions: [] };
}
export async function getEntitlements() {
  const state = sessionState();
  return {
    items: [30, 60].map((tier) => ({
      account_id: `demo-${tier}`,
      page_tier: tier,
      balance: { available: state.credits[tier], reserved: 0, consumed: state.consumed[tier] },
      expires_at: null,
    })),
  };
}
export async function redeemCode(code) {
  if (code !== 'DEMO2026') throw error('演示补充码为 DEMO2026，不需要真实授权码');
  const state = sessionState();
  state.credits[30] += 10;
  state.credits[60] += 3;
  saveDemoState(state);
  return getEntitlements();
}
export async function getStyles() {
  sessionState();
  return { items: [freeStyle, ...demoStyles] };
}
export async function getStylePreview(id) {
  sessionState();
  const style = demoStyles.find((value) => value.id === id);
  if (!style) throw error('没有找到该平台精选风格', 404);
  return {
    style_id: style.id,
    style_name: style.name,
    lifecycle: style.lifecycle,
    pages: style.pages,
  };
}
export async function getUploads() {
  return { items: sessionState().uploads };
}
export async function deleteUpload(id) {
  const state = sessionState();
  state.uploads = state.uploads.filter((file) => file.upload_id !== id);
  saveDemoState(state);
}
export async function uploadFile(file, { onProgress, signal } = {}) {
  const allowed = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|txt|md|csv)$/i;
  if (!allowed.test(file.name)) throw error('不支持此文件格式');
  if (file.size > 100 * 1024 * 1024) throw error('单个文件不能超过 100 MB');
  sessionState();
  for (let progress = 0; progress <= 5; progress++) {
    if (signal?.aborted) throw error('已取消上传');
    onProgress?.(progress / 5);
    await delay(70);
  }
  const state = sessionState();
  if (state.uploads.length >= 20) throw error('最多保留 20 个文件');
  if (state.uploads.reduce((total, item) => total + item.size_bytes, file.size) > 200 * 1024 * 1024)
    throw error('文件合计不能超过 200 MB');
  const upload = {
    upload_id: demoId('upload'),
    filename: file.name,
    size_bytes: file.size,
    status: 'ready',
    usable_for_generation: true,
    warnings: ['演示模式仅记录文件名和大小，不读取或上传文件内容'],
  };
  state.uploads.push(upload);
  saveDemoState(state);
  return upload;
}
export async function createJob(payload) {
  const state = sessionState();
  const topic = payload.topic?.trim();
  if (!topic) throw error('请填写主题与要求');
  if (topic.length > 10000) throw error('主题与要求不能超过 10000 字');
  if (!['pptx', 'docx', 'xlsx'].includes(payload.deliverable_kind || 'pptx'))
    throw error('不支持的产出格式');
  const tier = payload.page_policy?.max > 30 || state.credits[30] <= 0 ? 60 : 30;
  if (state.credits[tier] <= 0) throw error('演示额度不足，可用 DEMO2026 补充');
  if (payload.upload_ids.some((id) => !state.uploads.some((file) => file.upload_id === id)))
    throw error('参考文件已移除，请刷新后重试');
  state.credits[tier]--;
  state.consumed[tier]++;
  const job = {
    job_id: demoId('job'),
    state: 'queued',
    created_at: new Date().toISOString(),
    can_cancel: true,
    charged_tier: tier,
    progress: { overall_percent: 0 },
    status_message: '演示任务排队中',
    requested: {
      ...payload,
      topic,
      notify_email: '',
      style_name: demoStyles.find((style) => style.id === payload.style_id)?.name || '自由风格',
    },
  };
  state.jobs = [job, ...state.jobs].slice(0, 50);
  saveDemoState(state);
  return job;
}
export async function getJobs() {
  const state = sessionState();
  state.jobs = state.jobs.map((job) => advanceJob(job));
  saveDemoState(state);
  return { items: state.jobs };
}
export async function getJob(id) {
  const { items } = await getJobs();
  const job = items.find((value) => value.job_id === id);
  if (!job) throw error('任务不存在', 404);
  return job;
}
export async function cancelJob(id) {
  const state = sessionState();
  const index = state.jobs.findIndex((value) => value.job_id === id);
  if (index < 0) throw error('任务不存在', 404);
  const job = advanceJob(state.jobs[index]);
  if (['succeeded', 'failed', 'canceled'].includes(job.state)) return job;
  state.jobs[index] = {
    ...job,
    state: 'canceled',
    can_cancel: false,
    status_message: '演示任务已取消，模拟额度已退回',
  };
  state.credits[job.charged_tier]++;
  state.consumed[job.charged_tier]--;
  saveDemoState(state);
  return state.jobs[index];
}
export function subscribeJob(id, { onEvent, onError } = {}) {
  let disposed = false;
  const timer = window.setInterval(async () => {
    try {
      const job = await getJob(id);
      if (!disposed)
        onEvent?.({
          type: `job.${job.state}`,
          progress: job.progress,
          data: { status_message: job.status_message },
        });
    } catch (failure) {
      if (!disposed) onError?.(failure);
    }
  }, 450);
  return () => {
    disposed = true;
    window.clearInterval(timer);
  };
}
export async function downloadArtifact(artifactId) {
  const { items } = await getJobs();
  const job = items.find(
    (value) => value.state === 'succeeded' && value.artifact?.artifact_id === artifactId,
  );
  if (!job) throw error('演示产物不存在', 404);
  downloadDemoJob(job);
}
export { resetDemoState };
