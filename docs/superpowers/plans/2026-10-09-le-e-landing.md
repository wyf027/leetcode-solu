# le-e Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布 le-e 产品介绍与使用说明，并在 GitHub Pages 和个人首页提供正确入口。

**Architecture:** 独立静态站点，复用实机截图，不执行用户代码、不接收 Cookie。先部署验证，再更新两个现有索引的数据源；原 TUI 脏工作区不变。

**Tech Stack:** HTML、Tailwind CSS、原生 JavaScript、Vercel、GitHub Pages/Jekyll。

---

## 约束与执行分工

用户已批准书面设计，尚需选择执行方式。主会话是唯一写入者，独立子任务可只读复核链接、文案与发布结果。按用户规则，不新增测试文件，不运行 TUI 测试或构建；静态样式编译属于站点发布流程，如需另行构建 TUI，先明确请求。所有改动使用 apply_patch，不带入未授权的 TUI 本地改动。

## Task 1: 建立产品站文件与样式

**Files:** `project/le-e-landing/index.html`, `project/le-e-landing/input.css`, `project/le-e-landing/assets/tui.png`, `project/le-e-landing/app.js`。

- [ ] 读取当前本地 TUI 的 README、package.json、HeaderBar、keyRouter、createAppController；再读取 origin/main 的对应源码，区分已发布能力与本地新版能力。未公开的能力必须标注为当前开发版，不能提供无法取得对应功能的安装指南。
- [ ] 将本会话 `outputs/le-e-tui-20261009.png` 作为产品图片复制到 assets/tui.png。仅使用已确认的终端区域，不使用桌面截图，不缩小原始像素。
- [ ] 页面采用以下完整基础结构，依照已批准设计填入产品说明和实际安装命令，保持语义化 section 及导航锚点：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="le-e：集题库、题面、Micro 编辑、测试和提交于一体的 LeetCode 终端工作区。">
  <title>le-e · 终端里的 LeetCode 工作区</title>
  <link rel="stylesheet" href="styles.css">
  <script src="app.js" defer></script>
</head>
<body class="bg-zinc-950 text-zinc-100 antialiased">
  <header class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
    <a href="#" class="font-mono text-xl text-cyan-300">le-e</a>
    <nav aria-label="主导航" class="flex gap-6"><a href="#features">功能</a><a href="#start">开始使用</a><a href="#login">登录</a></nav>
  </header>
  <main class="mx-auto max-w-7xl px-6">
    <section class="py-20 text-center">
      <p class="font-mono text-cyan-300">LEETCODE / IN YOUR TERMINAL</p>
      <h1 class="mt-6 text-4xl font-semibold leading-tight md:text-6xl">把刷题工作区，留在终端里。</h1>
      <p class="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-400">找题、读题、写代码、测试与提交，在一个安静的工作区完成。</p>
      <div class="mt-8 flex flex-wrap justify-center gap-4"><a class="rounded-lg bg-cyan-300 px-6 py-3 text-zinc-950" href="#start">开始使用</a><a class="rounded-lg border border-zinc-700 px-6 py-3" href="https://github.com/wyf027/leetcode-solu/tree/main/project/le-e">查看源码 ↗</a></div>
      <a class="mt-12 block" href="assets/tui.png"><img class="h-auto w-full rounded-xl border border-zinc-700" src="assets/tui.png" width="1410" height="874" alt="le-e 实机界面：左侧题面、右侧 Micro 编辑器和底部执行日志"></a>
    </section>
    <section id="features" class="border-t border-zinc-800 py-16"><h2 class="text-3xl">从选题到提交，保持专注</h2><p class="mt-5 leading-8 text-zinc-400">中文题库与搜索、个人收藏与官方题单、Micro 同屏编辑、四种编程语言、测试结果，以及可调整的工作区。</p></section>
    <section id="start" class="border-t border-zinc-800 py-16"><h2 class="text-3xl">开始使用</h2><p class="mt-5 text-zinc-400">先完成源码安装、构建和助手配置；以下命令用于已初始化的 project/le-e 目录。</p><div class="mt-6 flex flex-wrap items-center gap-4 rounded-lg bg-zinc-900 p-5"><code id="start-command">corepack pnpm start</code><button data-copy="start-command" type="button" class="rounded border border-zinc-600 px-3 py-1">复制</button></div><p id="copy-status" role="status" class="mt-3 text-sm text-cyan-300"></p></section>
    <section id="login" class="border-t border-zinc-800 py-16"><h2 class="text-3xl">在本地登录</h2><ol class="mt-6 list-inside list-decimal space-y-4 text-zinc-300"><li>在浏览器登录 leetcode.cn。</li><li>打开开发者工具，在 Application → Cookies 中找到 LEETCODE_SESSION 和 csrftoken。</li><li>回到 TUI 按 c，分别粘贴两个值，用 Tab 切换输入框，按 Enter 登录。</li></ol><p class="mt-6 text-amber-200">Cookie 是账号凭据，仅粘贴到本地 TUI；不要上传、截图或分享给他人。本页面不接收 Cookie。</p></section>
  </main>
  <footer class="mx-auto max-w-7xl border-t border-zinc-800 px-6 py-10 text-sm text-zinc-400">基于 clearloop/leetcode-cli 构建 · 非力扣官方产品</footer>
</body>
</html>
```

- [ ] 根据真实脚本将完整初始化命令、快捷键表及已知限制加入对应 section。Node 版本遵循 package.json 的 `^22.12.0 || >=24.0.0`，不能笼统声称任意 Node 22+ 可用；公开源码不同步时清楚区分版本。
- [ ] 写入 input.css：

```css
@import "tailwindcss";
@source "./index.html";
@layer base {
  :focus-visible { outline: 2px solid #67e8f9; outline-offset: 4px; }
  html { scroll-padding-top: 2rem; }
}
```

- [ ] 写入 app.js：

```js
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy)?.textContent;
    const status = document.getElementById('copy-status');
    if (!text || !status) return;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '命令已复制';
    } catch {
      status.textContent = '无法访问剪贴板，请选中命令手动复制。';
    }
  });
});
```

## Task 2: 静态验证与独立复核

- [ ] `node --check project/le-e-landing/app.js`，预期退出码 0；`git diff --check`，预期无输出。
- [ ] 使用固定版本的 Tailwind CLI 编译 input.css 为 styles.css，保留可复现的依赖版本与命令；不使用运行时 CDN。
- [ ] 浏览器检查桌面和 390px 宽度，无整页横向溢出；截图保持比例；复制成功/失败提示可读；所有导航和源码链接可达。只读子任务复核文案，不触发 LeetCode 登录、执行或提交。
- [ ] 提交仅 landing 与设计材料，不混入 TUI、其他项目或凭据。

## Task 3: Vercel 发布

- [ ] 重新读取团队 `team_neI2Pkb9AksTVL3sxYKoJtJW` 项目列表，防止重复创建；名称 `wyf-le-e`。已有同名项目时先确认归属与用途。
- [ ] 上传本任务静态文件到已确认的团队和项目；不传仓库根目录、.env、Git 历史或本地凭据。暂存生产部署，核验 READY 和截图/CSS/JS 的 HTTP 状态，再分配正式别名。
- [ ] 将工具返回的实际正式 URL 写入任务卡；不猜域名。验证页面 title、安装指南和图片可公开读取，再更新索引。

## Task 4: 更新现有索引并验证

**Files:** wyf027/wyf027.github.io 的 gh-pages 分支 `_data/projects.yml`；wyf027/wyf027 的 main 分支 `README.md`。

- [ ] 在各仓库独立工作区读取最新 HEAD 与说明；记录原 SHA。Pages 的 index.html 使用 `site.data.projects` 循环，保持模板不变，修改数据源，而非手写第二张卡片。
- [ ] 向 projects.yml 增加唯一 le-e 条目：name 为 `le-e 终端刷题工作区`，description 为 `在终端浏览题库、阅读题面、使用 Micro 编码并测试提交。`，tags 为 `Vue`、`TypeScript`、`TUI`，preview_url 使用上一步实际正式 URL，source_url 为 `https://github.com/wyf027/leetcode-solu/tree/main/project/le-e`。已有条目则更新，不重复插入。
- [ ] 在 README 的 Selected Work 表格插入 le-e 行，包含产品官网与上述源码链接，保留既有 leetcode-solu 条目和其他项目。
- [ ] 按各仓库规则提交和推送授权范围内改动；如主分支保护要求 PR，创建并附加 PR，不绕过保护。
- [ ] 核验远端文件与公开 Pages 渲染都出现正确链接；记录 Pages 构建状态。无法验证公开页面时报告未完成，不以 push 成功代替上线。

## 交付

提供落地页正式链接、github.io 链接、GitHub 首页链接、提交 SHA、验证证据和未完成事项。不宣称未验证的 TUI 交互、账号登录或真实题目提交成功。
