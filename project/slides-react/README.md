# Slides React 创作台

基于 `https://slides.zoeypro.top` 浏览器前端整理的 React 项目，包含独立组件、业务状态、HTTP 接口适配器与无需原站授权码的演示模式。

## 运行

需要 Node.js 22.12+。在本目录执行：

```bash
npm ci
npm run dev
```

打开 `http://localhost:5188`，点击“进入演示创作台”。端口被占用时可运行 `npm run dev -- --port 5189`。

如需自行构建并运行静态服务：

```bash
npm run build
PORT=5191 npm start
```

## 真实模板目录

模板快照采集于 2026-10-15，替换此前六款生成 SVG 的占位模板：

- 42 款平台精选风格，另有一个自由风格入口。
- 30 款现行模板和 12 款典藏模板，共 249 页预览。
- 27 款有 8 页、3 款有 7 页，12 款典藏模板各有一页。
- 工作汇报 9 款、金融投资 9 款、战略咨询 8 款、宣传推广 8 款、学术研究 8 款。

目录、原始 ID、版本、顺序、名称及图片元数据保存在 `src/demo/style-catalog.json`。292 个原始图片文件（43 张封面和 249 页预览）保存在 `public/templates/`，共约 51 MiB，不依赖原站登录或外部图片地址。目录是采集日快照，不自动同步原站更新。

数据来源为原站 `/api/v1/styles`、`/api/v1/styles/{id}/preview-pages` 及其引用的图片。仅图片 URL 转换为本地路径；字段逐项对比与资源摘要见 [恢复记录](docs/template-catalog-provenance.json) 和 [图片清单](docs/template-assets.json)。原站封面接口声明的是展示尺寸，部分原图实际像素更大，均保留原值和原图。

## 演示模式边界

模板目录和预览图片是真实素材；生成任务、额度和上传记录为本地模拟，不调用 AI。上传仅记录文件名与大小，不读取正文；下载为标注演示用途的 HTML，不是 PPTX、DOCX 或 XLSX。没有恢复原站后端、模板生成规则或 PPTX 母版。

演示数据保存在浏览器 localStorage。页面顶部可重置记录，内置演示码 `DEMO2026` 仅用于本地模拟入口和额度，不是原站凭据。

## 连接兼容后端

复制 `.env.example` 为 `.env`，按需设置：

```dotenv
VITE_API_MODE=http
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://your-backend.example
```

`API_PROXY_TARGET` 仅用于服务端同源代理，不得放入服务端密钥。`VITE_` 配置在构建时进入前端。HTTP 适配器包含会话、CSRF、幂等请求、上传、任务、SSE 和下载协议；实际生成需要自行提供兼容后端。

## 目录

- `src/components/`：模板、上传、任务、额度和授权组件。
- `src/hooks/useStudio.js`：创作台状态与操作。
- `src/services/`：演示和 HTTP 适配器。
- `src/demo/`：原站模板快照、本地存储与模拟下载。
- `src/styles/`：恢复的原始样式及补充样式。
- `public/templates/`：原始封面与预览图片。
- `server.mjs`：静态服务与可选代理。

## 验证记录

2026-10-15 已逐项比对原站与本地的模板目录，核对全部图片 SHA-256，并观察列表、分类、搜索、7/8/1 页预览、选择及移动端显示。ESLint 检查通过；未运行构建或测试套件。本次提交不包含登录凭据、浏览器会话、构建产物或依赖目录。

可单独执行 `npm run check` 进行静态检查。`scripts/` 保留最初项目的流程检查脚本；它们不是此次模板恢复的完整验收记录。
