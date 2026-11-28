/** Small production static server with an optional, fixed backend proxy. */
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 5188);
const host = process.env.HOST || '0.0.0.0';
const target = process.env.API_PROXY_TARGET ? new URL(process.env.API_PROXY_TARGET) : null;
if (target && !['http:', 'https:'].includes(target.protocol))
  throw new Error('API_PROXY_TARGET must use HTTP(S)');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok","service":"slides-react"}');
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (!target) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          code: 'BACKEND_NOT_CONFIGURED',
          message: '服务端未配置真实 API，当前仅支持演示模式',
          retryable: false,
          request_id: 'local-config',
        }),
      );
      return;
    }
    const destination = new URL(url.pathname + url.search, target);
    const transport = destination.protocol === 'https:' ? https : http;
    const headers = { ...req.headers, host: destination.host };
    delete headers.connection;
    const upstream = transport.request(destination, { method: req.method, headers }, (response) => {
      const responseHeaders = { ...response.headers };
      if (responseHeaders['set-cookie'])
        responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) =>
          cookie.replace(/;\s*Domain=[^;]+/gi, ''),
        );
      res.writeHead(response.statusCode, responseHeaders);
      response.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          code: 'UPSTREAM_UNAVAILABLE',
          message: '无法连接配置的后端服务',
          retryable: true,
          request_id: 'local-proxy',
        }),
      );
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const filename = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(directory + path.sep) || pathname.includes('\0')) {
    res.writeHead(403);
    res.end();
    return;
  }
  let selected = filename;
  try {
    if (!(await stat(selected)).isFile()) throw new Error('Not a file');
  } catch {
    if (path.extname(pathname)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    selected = path.join(directory, 'index.html');
  }
  try {
    const info = await stat(selected);
    res.writeHead(200, {
      'Content-Type': types[path.extname(selected)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': selected.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') res.end();
    else
      createReadStream(selected)
        .on('error', () => res.destroy())
        .pipe(res);
  } catch {
    res.writeHead(503);
    res.end('Build the app with npm run build first.');
  }
});
server.listen(port, host, () => console.log(`Slides React listening on http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
