---
name: frontend-decouple-refactor
description: 前端解耦重构，按决策树拆分大文件/大组件、抽 Hook、收窄 Props、统一列表 key 与类型，输出可执行的重构步骤与修改后代码。
license: MIT
metadata:
  author: cursor-global-config
  version: "1.0.0"
---

# 前端解耦重构（Skill）

在用户要求“把这个大组件解耦”“按规范重构这段代码”“拆成更小模块”时使用本 Skill，按决策树给出重构方案与具体改动。

## 何时应用

- 用户贴出或指定一个文件/组件，要求“解耦”“按架构规范重构”时
- 用户说“这个文件太长了”“职责太多，帮忙拆分”时
- 需要同时做“拆文件 + 抽 Hook + 收窄 Props”时

## 输入时适合给 Agent 的一句话指令示例

- “用 frontend-decouple-refactor 对 `components/talents/CandidateReportModal.tsx` 做解耦，按 300 行和单职责拆。”
- “按解耦规范重构这个页面：拆 Hook、拆子组件、Props 最小化。”

## 必须执行的步骤

1. **决策树**：
   - 文件是否超过 300 行（有效代码）？→ 是则按职责拆成多个文件（如视图块、表格块、弹窗块、工具函数）。
   - 是否同一文件内承担“取数 + 状态编排 + 渲染 + 副作用 + 提交”？→ 是则拆成 Hook（取数/状态/提交）+ 纯展示组件（只接 props）。
   - 是否存在多处重复逻辑（如相同筛选、相同请求模式）？→ 是则抽成共享 Hook 或 util。
   - 列表 key 是否用了 index？→ 是则改为稳定业务 ID。
   - Props 是否为大对象或 `Record<string, unknown>`？→ 是则收窄为具名、显式类型 Props。
2. **输出重构清单**：按“序号 + 改动类型 + 涉及文件 + 简要说明”列出，例如：“1. 抽 Hook：新增 hooks/xxx/useXxx.ts，从 A.tsx 移入 state/effect。2. 拆组件：从 A.tsx 拆出 BTable.tsx，只接 list/loading/onAction。”
3. **输出修改后代码**：每个被改动或新增的文件给出完整内容；若仅小范围修改，给出片段并标明文件与行号范围。
4. **不改变对外行为**：重构不改变组件的对外 API（Props、事件）和用户可见行为；若必须改变，单独说明并标为 breaking。
5. **类型与规范**：新 Hook/组件均带 TypeScript 类型；遵守 antd-tailwind-separation、列表 key、条件类名约定。

## 与 Rules 的配合

- 遵守 `component-decoupling`、`typescript-strict-first`、`antd-tailwind-separation`。
- 遵守 `quality-gate`：所有改动文件 Prettier + ReadLints。

## 输出格式

- 先“重构清单”（可复制到 PR 或任务描述），再按文件给出代码；大文件可只给“关键片段 + 其余部分保持不变”的说明。
