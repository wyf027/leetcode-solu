# Screenshot Workflow Lite

一个静态版 screenshot-to-code 工作流草稿器。它不调用任何模型服务，也不上传图片；截图只在浏览器本地预览。

## 功能

- 上传截图并填写页面目标。
- 生成一组 screenshot-to-code 工作流节点。
- 在画布中查看节点和连线。
- 导出 workflow JSON 或复制 Markdown 提示词。

## 本地预览

直接打开 `index.html`，或在仓库根目录运行：

```bash
python3 -m http.server 8787 --directory project/screenshot-workflow-lite
```

然后访问 `http://127.0.0.1:8787/`。

## 说明

这个项目借鉴开源 screenshot-to-code 工具的产品方向，但不复用其源码。当前版本只负责把截图复刻任务拆成可执行 workflow，真正的视觉识别和代码生成交给外部模型或人工继续处理。
