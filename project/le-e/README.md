# le-e

`le-e` 是基于 Vue 3、TypeScript 和 `@simon_he/vue-tui` 构建的 LeetCode
终端界面，复用本机的 `clearloop/leetcode-cli` 登录状态和命令能力。

## 功能

- 浏览、搜索并按难度筛选题目
- 展示中文题目标题和题面
- 按收藏夹查看、收藏或取消收藏题目
- 暂停 TUI 后使用本机 Vim 编辑 JavaScript 解答，并在退出 Vim 后恢复界面
- 在终端执行测试并展示未通过的输入、输出和期望结果
- 确认后提交解答

## 环境要求

- Node.js 22.12 或更高兼容版本
- Corepack 与 pnpm 11.15.1
- 已安装并登录 `clearloop/leetcode-cli`
- 本机提供 `vim`

## 安装与启动

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm setup:editor
corepack pnpm setup:account
corepack pnpm start
```

`setup:editor` 会将 LeetCode CLI 的编辑器配置接入 `le-e-editor` 桥接程序；
`setup:account` 会构建只在 CLI 进程内部复用登录状态的收藏夹辅助程序。

## 常用快捷键

- `Enter`：加载题目详情
- `e`：使用本机 Vim，`:wq` 保存并返回
- `t`：测试当前题目
- `s`：打开提交确认
- `v`：切换题库/收藏页
- `a`：收藏或取消收藏
- `[` / `]`：切换收藏夹
- `?`：查看完整帮助
- `q`：退出

## 开发检查

```bash
corepack pnpm check
```

自动检查只使用本地假 CLI，不会进行真实 LeetCode 提交。
