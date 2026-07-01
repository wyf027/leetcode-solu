---
name: frontend-pr-review
description: 按前端规范对指定代码做 PR Review，从架构分层、TypeScript、antd/Tailwind、解耦、性能与可访问性、格式门禁等维度检查并给出可执行建议与范例路径。
license: MIT
metadata:
  author: cursor-global-config
  version: "1.0.0"
---

# 前端 PR Review（Skill）

在用户要求“按规范 Review 这段代码”“做一次前端 Code Review”“检查有没有违反架构/类型/样式规范”时使用本 Skill，输出结构化、可执行的审查结果。

## 何时应用

- 用户贴出代码或文件路径，要求“Review”“按规范检查”时
- 用户说“帮我看下这段有没有问题”“PR 前做一次前端规范检查”时
- 技术经理需要对提交内容做标准化 Review 时

## 输入时适合给 Agent 的一句话指令示例

- “用 frontend-pr-review 检查 `app/buser/dashboard/page.tsx` 和 `hooks/buser/dashboard/useDashboardPage.ts`。”
- “按前端规范对这次改动做 PR Review，给出可执行修改建议。”

## 必须执行的审查维度（按顺序）

1. **架构/分层**：page 是否只调 Hook + 渲染；是否在 page 或展示组件里直接调 Service、写复杂 state；Hook 是否包含 UI 或 DOM 操作；Service 是否只做 HTTP、未掺业务逻辑或业务类型导入。
2. **TypeScript**：是否出现 any、滥用 as、non-null `!`；Props / 公共类型定义是否清晰，并遵循当前项目既有 type / interface 风格；API/列表类型是否在类型层或明确定义；回调参数与返回值是否显式类型。
3. **antd 与 Tailwind**：布局与间距是否用 Tailwind；antd 组件是否用 styles/classNames 或项目既有方式而非全局覆盖；Modal/Drawer 等是否使用 antd 提供的样式扩展或项目既有方式；条件类名是否沿用当前项目既有拼接方式，避免引入新的风格分歧。
4. **解耦与可维护性**：是否单文件多职责、体量是否影响可维护性；Props 是否最小化；列表 key 是否稳定 ID；重复逻辑是否可抽 Hook/util。
5. **Next.js 边界**：是否不必要使用 `'use client'`；数据获取是否在路由/Server 层；是否整页 Client 仅因一小块交互。
6. **性能与可访问性**：是否用 useEffect 同步可推导状态；列表 key 是否稳定；可交互元素是否有 aria-label/文案；模态焦点是否合理。
7. **门禁**：是否存在明显格式化或 lint 问题（如超长行、未按项目规范格式化、条件类名与项目既有方式不一致）。

## 输出格式

- **按维度分块**，每块标题为上述维度之一。
- 每块内列出：**符合** / **不符合**；不符合项需注明**文件与行号或代码片段**，并给出**可执行修改建议**（如“将 X 抽成 useXxx”“此处改为 Y 类型”）。
- 可引用当前仓库已有相似实现作为参考；若不确定路径，不编造。
- 最后给**汇总**：必须改的项（MUST）、建议改的项（SHOULD），便于 PR 作者按优先级处理。

## 与 Rules 的配合

- 审查标准与 `pr-review-output`、`component-decoupling`、`typescript-strict-first`、`antd-tailwind-separation`、`nextjs-boundaries`、`perf-a11y-maintainability`、`quality-gate` 一致。
