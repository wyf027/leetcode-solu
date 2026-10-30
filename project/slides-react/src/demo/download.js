const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export function createDemoDocument(job) {
  const topic = escapeHtml(job.requested.topic);
  const kind = job.requested.deliverable_kind || 'pptx';
  const formats = { pptx: '演示文稿', docx: '文档', xlsx: '表格' };
  const content =
    kind === 'xlsx'
      ? `<table><thead><tr><th>项目</th><th>说明</th><th>状态</th></tr></thead><tbody>${['目标', '行动', '评估'].map((value) => `<tr><td>${value}</td><td>${topic} · ${value}示例</td><td>待补充实际数据</td></tr>`).join('')}</tbody></table>`
      : ['主题与目标', '核心内容', '下一步行动']
          .map(
            (heading, index) =>
              `<section><small>0${index + 1}</small><h2>${heading}</h2><p>${topic}</p><p>这是用于体验前端流程的示例页面，请替换为实际内容。</p></section>`,
          )
          .join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${topic} · 演示预览</title><style>body{font-family:system-ui,sans-serif;background:#f4f3fa;color:#242036;max-width:960px;margin:40px auto;padding:0 24px}h1{font-size:38px}section{background:white;border-radius:16px;padding:40px;margin:24px 0;min-height:220px;break-after:page}small{color:#7762dd;font-size:24px}.notice{padding:16px;border:1px solid #cfc6ed;border-radius:10px}table{border-collapse:collapse;width:100%;background:white;margin:24px 0}td,th{border:1px solid #ddd;padding:18px;text-align:left}</style><h1>${topic}</h1><p class="notice">${formats[kind]}流程演示 · 非 AI 生成 · 未解析上传文件 · 此文件为 HTML 预览，非 Office 格式。</p>${content}<footer>风格：${escapeHtml(job.requested.style_name)} · 任务：${escapeHtml(job.job_id)}</footer></html>`;
}

export function downloadDemoJob(job) {
  const blob = new Blob([createDemoDocument(job)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = job.artifact.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
