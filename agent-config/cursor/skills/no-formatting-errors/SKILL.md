---
name: no-formatting-errors
description: 确保生成或修改的代码无 Prettier/ESLint 格式化报错。在编写、生成、重构任意代码后必须执行格式化与 lint 检查，交付前 ReadLints 为零。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 生成代码零格式化报错（Skill）

本 Skill 在**生成、修改、重构**任意代码（含 TS/TSX/JS/JSX/CSS 等）时生效，确保交付代码**无格式化与 ESLint 格式化类报错**。

## 何时应用

- 用户要求「生成代码」「写一个组件」「实现某功能」等并涉及新建或修改代码文件时
- 用户提到「格式化报错」「lint 报错」「Prettier」或贴出 Insert/Replace/Delete 等 ESLint 报错时
- 完成任意代码编辑后，在回复用户「已完成」之前

## 必须执行的步骤

1. **对本次修改过的文件执行 Prettier**
   - 命令：`npx prettier --write <文件路径>`（可多文件）
   - 确保换行、缩进、引号、尾逗号等符合项目配置

2. **对修改过的文件执行 ReadLints**
   - 使用 ReadLints 工具或等价方式检查
   - 若有 **ESLint 格式化类** 报错（Insert/Replace/Delete 等），继续编辑直至修复

3. **交付前再次确认**
   - 在回复中说明「已完成」前，对改动文件再跑一次 ReadLints
   - 若仍有报错，不得视为任务完成，需继续修复

## 书写建议（从源头减少报错）

- 长 `className`、长模板字符串：按项目风格换行，避免单行过长
- 条件类名：使用项目约定的 `clsx` + `tailwind-merge` 等
- 生成代码时即按已格式化风格书写，不依赖「之后再说」

## 关联规则

- 项目规则：`.cursor/rules/no-formatting-errors.mdc`（alwaysApply，与本 Skill 一致）
- 与 `vercel-react-best-practices`、`frontend-team-best-practices-zh` 等配合使用，保证**功能正确 + 格式零报错**。
