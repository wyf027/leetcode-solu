---
name: nextjs-page-skeleton
description: 快速生成 Next.js App Router 页面模块骨架，包含 layout、page、Client 边界与数据占位，适用于新页面或新模块搭建。
license: MIT
metadata:
  author: cursor-global-config
  version: "1.0.0"
---

# Next.js 页面模块骨架（Skill）

在用户要求“新建一个 Next 页面”“搭一个 XX 模块”“按 App Router 生成页面骨架”时使用本 Skill，输出可直接落地的目录与文件骨架。

## 何时应用

- 用户说“新建一个页面”“加一个 XX 模块”“按 Next App Router 生成页面结构”时
- 用户给出模块名或路由路径（如 `/dashboard/settings`）并要求生成骨架时
- 需要区分 Server/Client、layout + page 结构时

## 输入时适合给 Agent 的一句话指令示例

- “用 nextjs-page-skeleton 为 `/buser/settings` 生成页面骨架，包含 layout 和 page，页面是 Client 的列表+筛选。”
- “按 Next App Router 生成一个 `reports` 模块骨架，要 layout、page、一个 Client 子组件。”

## 必须输出的结构

1. **目录**：`app/<segment>/<可选子段>/layout.tsx`、`app/<segment>/<可选子段>/page.tsx`；若需 Client 子组件，单独文件如 `components/<domain>/XxxSection.tsx` 并标 `'use client'`。
2. **layout.tsx**：默认 Server Component；仅导出默认的 layout 组件，可包含标题、子布局或 children；不在这里写复杂数据获取时，可留注释“此处可按需加 metadata / 服务端数据”。
3. **page.tsx**：若整页无交互，默认 Server；若有 state/事件，则 page 保持 Server，内层用 `<ClientSection />` 等 Client 子组件包裹交互区域；在文件顶注释说明“本页 Server/Client 划分理由”。
4. **占位**：数据获取处用 `// TODO: 在此处接入 getXxx 或 useXxx`；列表/表格用空数组或 1～2 条占位数据，类型与项目已有类型一致或留 `unknown` 并注释“替换为真实类型”。
5. **类型**：Props、state 用 TypeScript；类型定义清晰，并遵循当前项目既有 type / interface 风格。
6. **样式**：布局与间距用 Tailwind；若项目用 antd，仅在外层用 Tailwind，内部组件用 antd 的 styles/classNames。

## 与 Rules 的配合

- 遵守 `nextjs-boundaries`：能 Server 就 Server，Client 最小化。
- 遵守 `quality-gate`：生成后对新建文件执行项目当前使用的格式化与 lint 检查。

## 输出格式

- 按“目录树 + 单文件完整代码”给出，可直接复制到项目；若路径与当前仓库约定不符，说明“请按你项目实际 app/ 与 components/ 调整路径”。
