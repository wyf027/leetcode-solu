import { API_BASE_URL } from '../config.js';
import { ApiError, authHeaders, requestApi, responseError } from './client.js';

function sendBody(
  method,
  endpoint,
  body,
  { onProgress, signal, contentType, idempotent = false } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('上传已取消', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, API_BASE_URL + endpoint);
    xhr.withCredentials = true;
    for (const [name, value] of Object.entries(authHeaders({ write: true, idempotent })))
      xhr.setRequestHeader(name, value);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      cleanup();
      let response = null;
      try {
        response = JSON.parse(xhr.responseText || 'null');
      } catch {
        /* Acknowledgements may have no JSON body. */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(response);
      else reject(responseError(xhr.status, response));
    };
    xhr.onerror = () => {
      cleanup();
      reject(
        new ApiError({ code: 'NETWORK_ERROR', message: '上传失败，请检查网络', retryable: true }),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('上传已取消', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}
let capabilitiesPromise;
async function chunkConfiguration() {
  capabilitiesPromise ||= requestApi('/capabilities').catch(() => null);
  const capabilities = (await capabilitiesPromise)?.uploads?.chunked;
  return capabilities?.enabled &&
    Number.isFinite(capabilities.part_size) &&
    capabilities.part_size > 0
    ? capabilities
    : null;
}
async function retryPart(operation, signal) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (
        error.name === 'AbortError' ||
        attempt >= 2 ||
        !(error.retryable || [408, 425, 429].includes(error.status))
      )
        throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}
/** Prefer the observed chunk protocol when advertised; otherwise use multipart. */
export async function uploadFile(file, { onProgress, signal } = {}) {
  const config = file.size > 0 ? await chunkConfiguration() : null;
  if (config) {
    let session;
    try {
      session = await requestApi('/uploads/sessions', {
        method: 'POST',
        idempotent: true,
        signal,
        json: {
          filename: file.name,
          media_type: file.type || '',
          size_bytes: file.size,
          part_size: config.part_size,
        },
      });
    } catch (error) {
      if (![404, 405, 501].includes(error.status)) throw error;
    }
    if (session) {
      if (!session.session_id)
        throw new ApiError({ code: 'INVALID_UPLOAD_SESSION', message: '后端没有返回上传会话编号' });
      const partSize = Number(session.part_size || config.part_size);
      if (!Number.isFinite(partSize) || partSize <= 0)
        throw new ApiError({ code: 'INVALID_UPLOAD_SESSION', message: '后端返回的分块大小无效' });
      const endpoint = '/uploads/sessions/' + encodeURIComponent(session.session_id);
      for (let index = 0; index < Math.ceil(file.size / partSize); index++) {
        const offset = index * partSize;
        const part = file.slice(offset, Math.min(file.size, offset + partSize));
        await retryPart(
          () =>
            sendBody('PUT', `${endpoint}/parts/${index}`, part, {
              signal,
              contentType: 'application/octet-stream',
              onProgress: (progress) => onProgress?.((offset + progress * part.size) / file.size),
            }),
          signal,
        );
      }
      const result = await retryPart(
        () => requestApi(`${endpoint}/complete`, { method: 'POST', signal }),
        signal,
      );
      onProgress?.(1);
      return result;
    }
  }
  const data = new FormData();
  data.append('file', file);
  return sendBody('POST', '/uploads', data, { onProgress, signal, idempotent: true });
}
