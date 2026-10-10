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

脚本由 `wyf027.github.io` 仓库的 `le-e/install`、`le-e/install.ps1` 托管。必须先发布自动补齐依赖版本的脚本，再发布此页面。Windows 入口使用 WSL，不声称原生 Windows 支持；缺少 WSL 时请求管理员安装，并输出重启、首次 Linux 用户初始化和重新运行命令的说明。

安装器在 macOS、Ubuntu / Debian 中检测并安装缺失依赖，从固定源码版本进行本地编译。会在系统包安装前说明权限要求，不收集登录凭据、不绕过 UAC、不自动重启。其他 Linux 发行版给出手动指引。日志区分阶段、成功、需要人工处理和失败；完整安装及 Windows 实机交互未验收。
