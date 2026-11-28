# 授权与会话安全验证

验证范围为 #2256 新增的 `src/components/auth/AccessGate.jsx`、`src/hooks/useStudio.js` 及其 HTTP 适配器。测试以 `1917292f6bdc7ef9a049c7ac7167645c6465ee48` 的应用源码运行，使用 Playwright 拦截回环 Vite 页面的 API 请求，凭据和响应均为测试数据。

## 复现

在 `project/slides-react` 安装锁定依赖并启动测试页面：

```sh
npm ci
VITE_API_MODE=http VITE_API_BASE_URL=/mock-api/v1 \
  node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 --strictPort
```

另开终端，在同一目录指定本机 Chromium 可执行文件并运行：

```sh
CHROMIUM_PATH=/path/to/chromium node scripts/http-smoke.mjs
npm audit --audit-level=low --json
```

## 2026-11-10 验证结果

Node.js 24.22.1、npm 11.9.0、Chromium 153.0.8010.0。两条检查命令均退出 `0`。

| 检查 | 结果 |
| --- | --- |
| 过短或被拒绝的授权码 | 过短的输入未发出授权请求。HTTP 401 后，创作台保持关闭，未写入会话，未请求受保护的数据。 |
| 合法授权和请求标头 | 授权尝试使用独立的幂等键。受保护的请求带会话标头，CSRF 标头只随写请求发送，任务创建带幂等键。 |
| 分块上传及任务错误 | 分块重组一致。任务端点返回 HTTP 503 时，界面提示失败。 |
| npm 依赖扫描 | 审计结果的漏洞总数为 `0`。 |

浏览器脚本的四项检查全部通过，页面异常数为 `0`。脚本会在断言失败时退出非零，并写出 `artifacts/http-smoke-result.json`。本次覆盖前端与 HTTP 适配器。真实后端的会话签发、权限校验及 CSRF 拒绝需要在兼容后端单独验证。
