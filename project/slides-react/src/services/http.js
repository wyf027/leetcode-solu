import { API_BASE_URL } from '../config.js';
import { requestApi, rememberSession } from './client.js';
export { ApiError, isUnauthorized } from './client.js';
export { uploadFile } from './upload.js';

export const authorize = async (code) =>
  rememberSession(
    await requestApi('/access-sessions/code', {
      method: 'POST',
      json: { code: code.trim() },
      idempotent: true,
    }),
  );
export const getSession = async () => rememberSession(await requestApi('/session'));
export const redeemCode = (code) =>
  requestApi('/authorization-codes/redeem', {
    method: 'POST',
    json: { code: code.trim() },
    idempotent: true,
  });
export const getEntitlements = () => requestApi('/entitlements');
export const getStyles = () => requestApi('/styles');
export const getStylePreview = (id) =>
  requestApi(`/styles/${encodeURIComponent(id)}/preview-pages`);
export const getUploads = () => requestApi('/uploads');
export const deleteUpload = (id) =>
  requestApi(`/uploads/${encodeURIComponent(id)}`, { method: 'DELETE', idempotent: true });
export const createJob = (payload) =>
  requestApi('/jobs', { method: 'POST', json: payload, idempotent: true });
export const getJobs = () => requestApi('/jobs');
export const getJob = (id) => requestApi(`/jobs/${encodeURIComponent(id)}`);
export const cancelJob = (id) =>
  requestApi(`/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', idempotent: true });
export const createDownloadGrant = (id) =>
  requestApi(`/artifacts/${encodeURIComponent(id)}/download-grants`, {
    method: 'POST',
    idempotent: true,
  });
export const getDownloadUrl = (id) => `${API_BASE_URL}/downloads/${encodeURIComponent(id)}`;

export function subscribeJob(id, { onEvent, onError } = {}) {
  const events = new EventSource(`${API_BASE_URL}/jobs/${encodeURIComponent(id)}/events`, {
    withCredentials: true,
  });
  const readEvent = (event) => {
    try {
      onEvent?.(JSON.parse(event.data));
    } catch {
      /* Ignore heartbeat frames. */
    }
  };
  events.addEventListener('job-event', readEvent);
  events.addEventListener('message', readEvent);
  events.addEventListener('error', (event) => onError?.(event));
  return () => events.close();
}
