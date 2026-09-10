# le-e

`le-e` 是基于 Vue 3、TypeScript 和 `@simon_he/vue-tui` 构建的 LeetCode
终端界面，复用本机的 `clearloop/leetcode-cli` 登录状态和命令能力。

## 功能

- 浏览、搜索并按难度筛选题目
- 展示中文题目标题和题面
- 题目图片在支持图形协议的终端原生显示；Apple Terminal 等使用彩色字符画布回退（清晰度较低）
- 按收藏夹查看、收藏或取消收藏题目
- 题目列表、题干、Micro 三列同屏；左侧列表可收起，两条竖向分隔线支持拖拽
- 支持 JavaScript、Python 3、Java、C++，切换语言后重新打开对应源码
- 在终端执行测试并展示未通过的输入、输出和期望结果
- 确认后提交解答

## 环境要求

- Node.js 22.12 或更高兼容版本
- Corepack 与 pnpm 11.15.1
- 已安装并登录 `clearloop/leetcode-cli`
- 本机提供 `micro`（macOS 可用 `brew install micro` 安装）
- 内嵌终端依赖 `node-pty` 和 `@xterm/headless`；macOS 安装后会设置预编译启动助手的执行权限

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
- 鼠标滚轮：滚动鼠标所在的题目列表、题干、Micro 或日志区域，无需先点击；列表滚动不改变选中题目
- `b` 或点击列表首行：收起/展开题目列表
- 拖动题干和编码区之间的竖线：调整宽度；编辑器外也可用 `Ctrl+←/→`
- 拖动列表右侧竖线调整列表宽度；点击列表上方收起按钮或收起后的 `▶` 展开
- 拖动日志上方横线调整高度，三列内容区域同步伸缩，Micro 同步缩放
- `F6` / `Shift+F6`：切换栏目；编辑器外可用 `Tab`，编辑器内保留 Tab 原功能
- `e`：在右栏打开 Micro，直接输入代码；`Ctrl+S` 保存，`Ctrl+Q` 退出
- 底部按钮或 `F2` 保存、`F3` 执行、`F4` 提交；执行/提交先保存成功并结束编辑，再调用 CLI。提交仍需确认
- 编辑期间可切到题干阅读；退出编辑器后可换题、切换语言或退出应用
- `g`：切换编程语言
- `t`：测试当前题目
- `s`：打开提交确认
- `v`：切换题库/收藏页
- `a`：收藏或取消收藏
- `[` / `]`：切换收藏夹
- `?`：查看完整帮助
- `q`：退出

内嵌窗口运行真实 Micro，并使用独立临时配置和保存回执插件，不修改用户的 Micro
全局配置。保存失败或回执超时不会执行/提交。输入经过终端组件解析，少数非标准
扩展键序列可能不受支持；`F2/F3/F4/F6` 保留为应用快捷键。

## 开发检查

```bash
corepack pnpm check
```

自动检查只使用本地假 CLI，不会进行真实 LeetCode 提交。

终端运行时代码通过 `import { env } from 'node:process'` 读取环境变量。
避免直接使用 `process.env`：当前 Vite 客户端构建会把它替换为空对象；
涉及终端能力或子进程环境时，需要同时检查打包产物的运行行为。
