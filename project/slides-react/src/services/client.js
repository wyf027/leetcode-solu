import { API_BASE_URL } from '../config.js';

export class ApiError extends Error {
  constructor({ code, message, status = 0, retryable = false, requestId = '' }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}
export const isUnauthorized = (error) =>
  error instanceof ApiError &&
  (error.status === 401 || ['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(error.code));
export const createIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let csrfToken = '';
let sessionId = '';
try {
  sessionId = sessionStorage.getItem('slides-api-session') || '';
} catch {
  /* Cookies remain available. */
}

export function rememberSession(result) {
  if (result?.csrf_token) csrfToken = result.csrf_token;
  if (result?.session_id) {
    sessionId = result.session_id;
    try {
      sessionStorage.setItem('slides-api-session', sessionId);
    } catch {
      /* In-memory session. */
    }
  }
  return result;
}
export function authHeaders({ write = false, idempotent = false } = {}) {
  return {
    ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
    ...(write && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(idempotent ? { 'Idempotency-Key': createIdempotencyKey() } : {}),
  };
}
export function responseError(status, body) {
  return new ApiError({
    code: body?.code || 'HTTP_ERROR',
    message: body?.message || `请求失败（HTTP ${status}）`,
    status,
    retryable: body?.retryable ?? status >= 500,
    requestId: body?.request_id || '',
  });
}
export async function requestApi(
  endpoint,
  { method = 'GET', json, signal, idempotent = false } = {},
) {
  let response;
  try {
    response = await fetch(API_BASE_URL + endpoint, {
      method,
      credentials: 'include',
      signal,
      headers: {
        ...authHeaders({ write: !['GET', 'HEAD'].includes(method), idempotent }),
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch (cause) {
    if (signal?.aborted || cause.name === 'AbortError') throw cause;
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: '无法连接后端，请检查服务地址或网络',
      retryable: true,
    });
  }
  if (response.status === 204) return null;
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* Handled below. */
  }
  if (!response.ok) throw responseError(response.status, body);
  if (text && body === null)
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: '后端返回了无法解析的数据',
      status: response.status,
    });
  return body;
}
