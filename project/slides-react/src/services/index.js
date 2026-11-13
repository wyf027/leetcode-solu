/** Data boundary: all UI components use these operations in both modes. */
import { isDemo } from '../config.js';
import * as http from './http.js';
import * as demo from './demo.js';

const adapter = isDemo ? demo : http;
export const authorize = (...args) => adapter.authorize(...args);
export const getSession = (...args) => adapter.getSession(...args);
export const redeemCode = (...args) => adapter.redeemCode(...args);
export const getEntitlements = (...args) => adapter.getEntitlements(...args);
export const getStyles = (...args) => adapter.getStyles(...args);
export const getStylePreview = (...args) => adapter.getStylePreview(...args);
export const getUploads = (...args) => adapter.getUploads(...args);
export const deleteUpload = (...args) => adapter.deleteUpload(...args);
export const uploadFile = (...args) => adapter.uploadFile(...args);
export const createJob = (...args) => adapter.createJob(...args);
export const getJobs = (...args) => adapter.getJobs(...args);
export const getJob = (...args) => adapter.getJob(...args);
export const cancelJob = (...args) => adapter.cancelJob(...args);
export const subscribeJob = (...args) => adapter.subscribeJob(...args);
export async function downloadArtifact(artifactId) {
  if (isDemo) return demo.downloadArtifact(artifactId);
  const grant = await http.createDownloadGrant(artifactId);
  const target = new URL(
    grant?.download_url || http.getDownloadUrl(grant?.grant_id),
    window.location.href,
  );
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('下载地址格式无效');
  window.location.assign(target.href);
}
export { ApiError, isUnauthorized } from './http.js';
