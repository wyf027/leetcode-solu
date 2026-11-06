import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5188';
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
});
const result = { checks: [], pageErrors: [], externalRequests: [] };
const check = (name) => {
  result.checks.push(name);
  console.log('PASS', name);
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    locale: 'zh-CN',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin)
      result.externalRequests.push(request.url());
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '进入演示创作台', exact: true }).click();
  const topic = page.getByRole('textbox', { name: '演示主题与要求', exact: true });
  await topic.waitFor();
  assert(await page.locator('.generate-button').isDisabled());
  check('demo entry and required-field validation');
  const toolbarBounds = await page.locator('.appearance-toolbar').boundingBox();
  const topbarBounds = await page.locator('.topbar').boundingBox();
  assert(toolbarBounds.y + toolbarBounds.height <= topbarBounds.y);
  check('appearance controls do not overlap navigation');
  await page.getByRole('button', { name: '深色', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  check('theme selection');
  await topic.fill('季度业务回顾 <script>示例</script>');
  await page.locator('.source-card--violet').click();
  assert(await page.locator('.generate-button').isEnabled());
  await page.getByLabel('选择资料', { exact: true }).setInputFiles([
    { name: '季度总结.md', mimeType: 'text/markdown', buffer: Buffer.from('# 示例资料') },
    { name: '销售数据.csv', mimeType: 'text/csv', buffer: Buffer.from('月份,收入\n一月,100') },
    { name: '待移除.txt', mimeType: 'text/plain', buffer: Buffer.from('演示') },
  ]);
  await page.getByRole('button', { name: /管理全部 3 个文件/ }).waitFor();
  await page.getByRole('button', { name: /管理全部 3 个文件/ }).click();
  await page.getByRole('button', { name: '移除 待移除.txt', exact: true }).click();
  await page.getByRole('button', { name: '关闭文件管理', exact: true }).click();
  await page.getByRole('button', { name: /管理全部 2 个文件/ }).waitFor();
  check('upload metadata, file manager and removal');
  await page.locator('.source-card--indigo').click();
  await page.getByPlaceholder('搜索风格', { exact: true }).fill('深蓝');
  await page.getByRole('button', { name: '查看深蓝工作汇报完整预览', exact: true }).click();
  await page.getByRole('button', { name: '下一页预览', exact: true }).click();
  assert(
    await page.locator('.style-preview__stage img').evaluate((image) => image.naturalWidth > 0),
  );
  await page.getByRole('button', { name: '使用此风格', exact: true }).click();
  check('style search, multi-page preview and selection');
  await page.locator('.generate-button').click();
  await page.getByRole('button', { name: '确认生成', exact: true }).click();
  await page.getByRole('button', { name: '查看进度', exact: true }).click();
  await page.getByRole('button', { name: '下载成品', exact: true }).waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载成品', exact: true }).click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith('.demo.html'));
  const documentPath = path.join(artifacts, 'demo-download.html');
  await download.saveAs(documentPath);
  const html = await fs.readFile(documentPath, 'utf8');
  assert(html.includes('非 AI 生成'));
  assert(html.includes('&lt;script&gt;示例&lt;/script&gt;'));
  assert(!html.includes('<script>示例</script>'));
  await page.getByRole('button', { name: '关闭任务详情', exact: true }).click();
  check('simulated progress, completion, labelled download and escaped content');
  await page.reload({ waitUntil: 'networkidle' });
  await topic.waitFor();
  await page.getByRole('button', { name: '任务历史', exact: true }).click();
  await page.locator('.history-row').first().waitFor();
  assert((await page.locator('.history-row').first().innerText()).includes('季度业务回顾'));
  await page.getByRole('button', { name: '关闭任务历史', exact: true }).click();
  check('history persists after reload');
  await topic.fill('取消演示测试');
  await page.locator('.source-card--violet').click();
  const creditTotal = () =>
    page.evaluate(() =>
      Object.values(JSON.parse(localStorage.getItem('slides-react-demo-v1')).credits).reduce(
        (a, b) => a + b,
        0,
      ),
    );
  const beforeCancel = await creditTotal();
  await page.locator('.generate-button').click();
  await page.getByRole('button', { name: '确认生成', exact: true }).click();
  await page.getByRole('button', { name: '查看进度', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '取消生成', exact: true }).click();
  await page.locator('.job-state').filter({ hasText: '已取消' }).waitFor();
  assert.equal(await creditTotal(), beforeCancel);
  await page.getByRole('button', { name: '关闭任务详情', exact: true }).click();
  check('cancel and exactly-once credit refund');
  await page.getByLabel('选择资料', { exact: true }).setInputFiles({
    name: 'invalid.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('test'),
  });
  await page.locator('.toast').filter({ hasText: '不支持此文件格式' }).waitFor();
  check('unsupported upload rejected');
  await page.getByRole('button', { name: 'Word 文档', exact: true }).click();
  assert(
    await page.getByRole('heading', { name: '想做一份怎样的Word？', exact: true }).isVisible(),
  );
  assert.equal(await page.locator('.page-policy-control').count(), 0);
  await page.getByRole('button', { name: 'Excel 表格', exact: true }).click();
  assert(
    await page.getByRole('heading', { name: '想做一份怎样的Excel？', exact: true }).isVisible(),
  );
  await page.getByRole('button', { name: 'PPT 演示', exact: true }).click();
  await page.getByRole('button', { name: '美化已有 PPT', exact: true }).click();
  assert(await page.locator('.generate-button').isDisabled());
  await page.getByLabel('选择资料', { exact: true }).setInputFiles({
    name: '参考.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from('demo-metadata-only'),
  });
  await page.getByRole('button', { name: /管理全部 3 个文件/ }).waitFor();
  assert(await page.locator('.generate-button').isEnabled());
  check('document formats and beautify PPTX requirement');
  await page.getByRole('button', { name: '添加额度', exact: true }).click();
  await page.getByRole('button', { name: '验证并添加', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await creditTotal(), beforeCancel + 13);
  check('demo credit replenishment');
  await page.screenshot({ path: path.join(artifacts, 'studio-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, 'studio-mobile.png'), fullPage: true });
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert(
    dimensions.content <= dimensions.viewport + 1,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`,
  );
  check('mobile layout has no horizontal overflow');
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.externalRequests, []);
  check('no page exceptions or external requests');
  result.passed = true;
  await context.close();
} catch (error) {
  result.passed = false;
  result.failure = error.stack;
  throw error;
} finally {
  await fs.writeFile(path.join(artifacts, 'smoke-result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
