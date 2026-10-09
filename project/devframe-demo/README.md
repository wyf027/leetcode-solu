# Devframe Demo

参考 [Devframe](https://github.com/devframes/devframe) 制作的 Chrome DevTools 面板演示，使用原生 JavaScript 和本地 Tailwind CSS。当前版本 `1.2.1`，DevTools 页签名称为 `*Devframe`。

## 安装到 Chrome

1. 下载本目录的全部文件，或克隆仓库。
2. 打开 `chrome://extensions/`，开启“开发者模式”。
3. 点击“加载未打包的扩展程序”，选择 `project/devframe-demo/`。
4. 在需要检查的页面打开 DevTools，切换到 `*Devframe` 页签；窄窗口中可从 `»` 菜单找到它。

更新后，在扩展管理页点击本扩展的“重新加载”，再关闭并重新打开 DevTools。

## 使用

- 点击 `⌖ Select`，在被检查的页面点击元素；按 Esc 可取消。
- 详情显示 React/Vue/DOM 组件推断、CSS 选择器、尺寸和位置。HTML 只保留首标签，单行省略，详情区没有内部滚动条。
- 点击详情中的定位图标，在 Chrome Elements 面板查看该元素。
- 支持主题切换、列表筛选、工具与页签切换，以及模拟命令反馈和 Preview 图表。

也可以直接打开 `devframe-demo.html` 预览界面：

```bash
open project/devframe-demo/devframe-demo.html
```

普通网页预览不具备 DevTools 的元素选择与定位能力。

## 能力范围

Git、终端、RPC、WebSocket、资源和健康状态均为演示数据；本项目不会启动 Web 服务或系统进程，也没有接入 Devframe 的真实 Hub。元素选择使用 `chrome.devtools.inspectedWindow.eval` 在被检查页面临时添加覆盖层和 `window.__DEVFRAME_PICKER__*` 状态，选择或取消后移除覆盖层。框架名称由 DOM 上可访问的 React/Vue 信息推断。

全部运行文件都在本目录，样式已随代码提供，无需安装依赖、运行构建或访问 CDN。
