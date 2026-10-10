# le-e landing

`le-e-landing` 是 le-e 的静态介绍页，适合直接部署为静态文件。

## 本地生成 CSS

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build:css
```

将本目录中的 `index.html`、`app.js`、`styles.css` 和 `assets/` 一并部署即可；页面没有运行时 CDN、后端、分析追踪或 Cookie 收集。

项目源码：[project/le-e](https://github.com/wyf027/leetcode-solu/tree/main/project/le-e)。

## 一行安装入口

页面提供 macOS / Linux 与 Windows 切换、复制和查看脚本链接：

```bash
curl -fsSL https://wyf027.github.io/le-e/install | bash
```

```powershell
powershell -c "irm https://wyf027.github.io/le-e/install.ps1 | iex"
```

脚本由 `wyf027.github.io` 仓库的 `le-e/install`、`le-e/install.ps1` 托管。必须先发布脚本并核对响应为脚本原文，再发布此页面，避免安装入口 404 或返回 HTML。Windows 入口使用已初始化的 WSL Linux 发行版，不声称原生 Windows 支持；需要在 WSL 内准备依赖。

安装器从固定源码版本进行本地编译，需要依赖和网络，不会处理登录凭据或自动提权。当前变更仅完成源码实现；完整安装及 Windows 实机交互未验收。
