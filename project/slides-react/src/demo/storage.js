export const DEMO_STORAGE_KEY = 'slides-react-demo-v1';

const initial = () => ({
  version: 1,
  authenticated: false,
  credits: { 30: 12, 60: 3 },
  consumed: { 30: 0, 60: 0 },
  uploads: [],
  jobs: [],
});
let memoryState;

function validState(value) {
  return (
    value?.version === 1 &&
    typeof value.authenticated === 'boolean' &&
    [30, 60].every(
      (tier) =>
        Number.isFinite(value.credits?.[tier]) &&
        value.credits[tier] >= 0 &&
        Number.isFinite(value.consumed?.[tier]) &&
        value.consumed[tier] >= 0,
    ) &&
    Array.isArray(value.uploads) &&
    value.uploads.every(
      (file) =>
        typeof file.upload_id === 'string' &&
        typeof file.filename === 'string' &&
        Number.isFinite(file.size_bytes),
    ) &&
    Array.isArray(value.jobs) &&
    value.jobs.every(
      (job) =>
        typeof job.job_id === 'string' &&
        typeof job.requested?.topic === 'string' &&
        [30, 60].includes(job.charged_tier) &&
        Number.isFinite(Date.parse(job.created_at)) &&
        ['queued', 'running', 'succeeded', 'canceled', 'failed'].includes(job.state),
    )
  );
}

export function readDemoState() {
  try {
    const value = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY));
    if (validState(value)) return value;
  } catch {
    /* Storage may be disabled; a session-local fallback still works. */
  }
  return structuredClone(memoryState || initial());
}

export function saveDemoState(state) {
  memoryState = structuredClone(state);
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* No file contents or credentials are persisted. */
  }
}

export function resetDemoState() {
  const state = initial();
  saveDemoState(state);
  return state;
}

export function demoId(prefix) {
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
