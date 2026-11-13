import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.TEST_HTTP_URL || 'http://127.0.0.1:5190';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true,
});
const result = { checks: [], pageErrors: [], interceptedRequests: [] };
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  let signedIn = false;
  let uploads = [];
  const parts = [];
  const authorizationKeys = new Set();
  let submitted;
  const session = { session_id: 'test-session', csrf_token: 'test-csrf', permissions: [] };
  const failure = (message) => ({
    code: 'UNAUTHENTICATED',
    message,
    retryable: false,
    request_id: 'fixture',
  });
  await page.route('**/mock-api/v1/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace('/mock-api/v1', '');
    const method = request.method();
    const headers = request.headers();
    result.interceptedRequests.push(`${method} ${endpoint}`);
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (endpoint === '/access-sessions/code') {
      assert.equal(headers['x-session-id'], undefined);
      assert.equal(headers['x-csrf-token'], undefined);
      const idempotencyKey = headers['idempotency-key'];
      assert(idempotencyKey);
      assert(!authorizationKeys.has(idempotencyKey));
      authorizationKeys.add(idempotencyKey);
      if (request.postDataJSON().code !== 'TESTCODE') return json(failure('测试授权码无效'), 401);
      signedIn = true;
      return json(session);
    }
    if (endpoint === '/session') {
      assert.equal(headers['x-session-id'], signedIn ? session.session_id : undefined);
      assert.equal(headers['x-csrf-token'], undefined);
      return signedIn ? json(session) : json(failure('请先登录'), 401);
    }
    assert(signedIn);
    assert.equal(headers['x-session-id'], session.session_id);
    assert.equal(
      headers['x-csrf-token'],
      ['GET', 'HEAD'].includes(method) ? undefined : session.csrf_token,
    );
    if (endpoint === '/entitlements')
      return json({
        items: [
          { account_id: 'test-credit', page_tier: 30, balance: { available: 5, consumed: 0 } },
        ],
      });
    if (endpoint === '/styles')
      return json({ items: [{ id: 'free_style', name: '自由风格', version: 1 }] });
    if (endpoint === '/uploads') return json({ items: uploads });
    if (endpoint === '/capabilities')
      return json({ uploads: { chunked: { enabled: true, part_size: 4 } } });
    if (endpoint === '/uploads/sessions') {
      assert.equal(request.postDataJSON().filename, 'fixture.txt');
      return json({ session_id: 'test-upload', part_size: 4, parts_total: 3 });
    }
    if (endpoint.startsWith('/uploads/sessions/test-upload/parts/')) {
      parts.push(request.postDataBuffer());
      return json({ received: true });
    }
    if (endpoint === '/uploads/sessions/test-upload/complete') {
      assert.equal(Buffer.concat(parts).toString(), '0123456789');
      uploads = [
        {
          upload_id: 'upload-1',
          filename: 'fixture.txt',
          size_bytes: 10,
          status: 'ready',
          usable_for_generation: true,
        },
      ];
      return json(uploads[0]);
    }
    if (endpoint === '/jobs' && method === 'POST') {
      assert(headers['idempotency-key']);
      submitted = request.postDataJSON();
      return json(
        {
          code: 'TEST_GENERATION_UNAVAILABLE',
          message: '测试服务暂时不可用，请稍后重试',
          retryable: true,
          request_id: 'fixture-job',
        },
        503,
      );
    }
    throw new Error(`Unexpected request ${method} ${endpoint}`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  const accessCode = page.getByLabel('授权码', { exact: true });
  const enterStudio = page.getByRole('button', { name: '进入创作台', exact: true });
  const topic = page.getByRole('textbox', { name: '演示主题与要求', exact: true });
  await accessCode.fill(' ABC ');
  await enterStudio.click();
  await page.getByRole('alert').filter({ hasText: '请输入至少 6 位授权码' }).waitFor();
  assert.deepEqual([...new Set(result.interceptedRequests)], ['GET /session']);
  await accessCode.fill('BADCODE');
  await enterStudio.click();
  await page.getByRole('alert').filter({ hasText: '测试授权码无效' }).waitFor();
  assert.equal(await topic.count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('slides-api-session')), null);
  assert.deepEqual([...new Set(result.interceptedRequests)], [
    'GET /session',
    'POST /access-sessions/code',
  ]);
  result.checks.push('short and rejected access codes never open the studio or fetch protected data');
  await accessCode.fill('TESTCODE');
  await enterStudio.click();
  await topic.fill('真实接口配置测试');
  await page.locator('.source-card--violet').click();
  result.checks.push('authorized reads and writes use the expected session, CSRF and idempotency headers');
  await page
    .getByLabel('选择资料', { exact: true })
    .setInputFiles({
      name: 'fixture.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('0123456789'),
    });
  await page.getByRole('button', { name: /管理全部 1 个文件/ }).waitFor();
  assert.equal(parts.length, 3);
  result.checks.push('capability-driven chunked upload and completion');
  await page.locator('.generate-button').click();
  await page.getByRole('button', { name: '确认生成', exact: true }).click();
  await page.locator('.toast').filter({ hasText: '测试服务暂时不可用' }).waitFor();
  assert.equal(submitted.topic, '真实接口配置测试');
  assert.deepEqual(submitted.upload_ids, ['upload-1']);
  assert.equal(submitted.deliverable_kind, 'pptx');
  assert.equal(submitted.presentation_operation, 'create');
  result.checks.push('job payload and backend error displayed without false success');
  assert.deepEqual(result.pageErrors, []);
  result.passed = true;
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.passed = false;
  result.failure = error.stack;
  throw error;
} finally {
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile('artifacts/http-smoke-result.json', JSON.stringify(result, null, 2));
  await browser.close();
}
