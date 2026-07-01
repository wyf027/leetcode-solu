---
name: code-review
description: 按团队规范对前端代码进行审查。技术经理 Review 时或用户要求「按规范检查这段代码」时使用，按五层架构、组件解耦、TypeScript 严格、Antd 规范逐项检查并给出修改建议与范例路径。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 代码审查（Skill）

当用户提供一段代码或文件路径，要求 **按团队规范做 Code Review** 时，使用本 Skill 进行结构化审查并给出可执行建议。

## 何时应用

- 用户说「帮我 review 这段代码」「按规范检查一下」「看看有没有违反架构」时
- 用户贴出文件路径或代码片段并要求审查时
- 技术经理需要按统一标准做代码评审时

## 审查维度（按顺序执行）

1. **五层架构**
   - page 是否只调 Hook + 渲染 Component，是否直接调 Service 或写复杂 state/handler。
   - Component 是否只接 Props，是否直接调 API 或全局 state。
   - Hook 是否只做逻辑与数据，是否包含 UI 或 DOM 操作。
   - Service 是否只做 HTTP，是否包含业务逻辑或业务类型导入。

2. **组件解耦**
   - 单文件是否超过 300 行，是否承担 3+ 职责。
   - 是否存在应抽离的重复逻辑（Hook 或子组件）。
   - 列表 key 是否使用稳定业务 ID，是否误用 index。

3. **TypeScript 严格**
   - 是否出现 `any`、滥用 `as`、non-null `!`。
   - Props 是否用 interface 并 export，API 类型是否在 types/ 层定义。

4. **Antd + Tailwind**
   - 布局与间距是否用 Tailwind。
   - antd 组件样式是否用 styles/classNames，是否存在 `.ant-xxx` 全局覆盖。

5. **格式与规范**
   - 是否通过 Prettier 与 ESLint，条件类名是否使用 clsx + tailwind-merge。

## 输出格式

- 按上述维度列出「符合 / 不符合」项。
- 对不符合项给出 **具体修改建议** 和（若适用）**项目内范例路径**（如 `components/buser/settingsAccount/OrgStructure/`、`hooks/buser/settingsAccount/baseHooks.ts`）。
- 不泛泛而谈，每条建议可落地到行或文件。

## 与 Rules 的配合

- 审查标准与以下 Rules 一致：vercel-react-best-practices、frontend-team-best-practices-zh、phase2-architecture、phase3-optimization、antd-tailwind-integration、typescript-strict、component-decoupling-patterns。
