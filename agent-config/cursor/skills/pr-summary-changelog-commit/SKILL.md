---
name: pr-summary-changelog-commit
description: 根据改动内容生成 PR Summary、Changelog 条目与符合规范的 Commit Message，格式统一、可直接粘贴使用。
license: MIT
metadata:
  author: cursor-global-config
  version: "1.0.0"
---

# PR Summary / Changelog / Commit Message（Skill）

在用户要求“写一段 PR 描述”“生成 Changelog”“给这次改动写 commit message”时使用本 Skill，根据当前改动或用户描述输出结构化文案。

## 何时应用

- 用户说“帮写 PR 描述”“生成本次改动的 Changelog”“写一个 commit message”时
- 用户已提供改动列表或 diff 摘要，需要整理成 PR/Changelog/Commit 时
- 需要统一 type(scope): subject 或团队约定格式时

## 输入时适合给 Agent 的一句话指令示例

- “用 pr-summary-changelog-commit 根据这次改动生成 PR Summary 和一条 commit message。”
- “按 type(scope): subject 生成 commit message，本次是 feat：dashboard 增加实验弹窗。”

## 输出内容要求

### 1. PR Summary（PR 描述）

- **必须包含**：变更类型（feat / fix / refactor / perf / chore / docs 等）、影响范围（模块/路由/目录）、主要改动列表（3～7 条，每条一句话）、自测说明或风险提示（若适用）。
- **风格**：简洁、可扫读；不写实现细节堆砌，重点写“做了什么、影响哪、怎么验”。
- **可选**：与相关 Issue/需求关联说明；截图或录屏建议（若为 UI 改动）。

### 2. Changelog 条目

- **格式**：若团队无固定模板，采用“日期 + 类型 + 范围 + 摘要 + 变更点列表”；若有（如 CHANGELOG-{name}.md），说明“请按你项目 CHANGELOG 模板填入以下内容”。
- **内容**：与 PR Summary 一致，可更简；每条变更可带文件或模块路径便于追溯。

### 3. Commit Message

- **格式**：`<type>(<scope>): <subject>`；subject 50 字内，中文或英文均可，不加句号。
- **type**：feat | fix | refactor | style | perf | test | chore | docs。
- **scope**：模块或目录名（如 dashboard、workflow、settings），可选。
- **示例**：`feat(dashboard): 增加实验弹窗与 Figma 样式`、`fix(workflow): 修复面试安排弹窗关闭后状态未重置`。

## 与 Rules 的配合

- 与 `pr-review-output` 中关于 PR Summary、Changelog、Commit 的约定一致；若项目有额外约定（如 scope 枚举、Changelog 按人隔离），在输出中说明“请按项目约定微调”。

## 输出格式

- 分三块给出：**PR Summary**（可直接粘贴到 PR 描述）、**Changelog 条目**（可直接粘贴到 CHANGELOG）、**Commit Message**（单行）；若用户只要求其中一项，只输出该项。
