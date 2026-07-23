---
name: antd-best-practices
description: Ant Design 组件使用最佳实践，适用于 Next.js + Antd + Tailwind 项目。生成或修改含 Modal、Form、Table、Select、Input 等组件时参考 styles/classNames 用法、与 Tailwind 分工及标准写法模板。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# Antd 组件最佳实践（Skill）

在 **Next.js + Ant Design + Tailwind CSS** 技术栈下，生成或修改含 antd 组件的代码时应用本 Skill，确保符合团队规范且与 Tailwind 不冲突。

## 何时应用

- 用户要求「加一个弹窗」「写一个表单」「用 Table 展示列表」等并涉及 antd 组件时
- 修改现有 Modal、Drawer、Form、Table、Select、Input、DatePicker 等组件时
- 用户提到「antd 样式被覆盖」「和 Tailwind 冲突」时

## 核心原则

1. **布局与间距用 Tailwind**：容器 `flex`、`gap`、`p-*`、`m-*`、`w-*`、`h-*` 一律用 Tailwind。
2. **组件外观用 antd API**：用 `styles`、`classNames`、`rootClassName` 定制，不写 `.ant-xxx` 全局覆盖。
3. **主题统一**：在 `app/layout.tsx` 用 ConfigProvider 配置 token，与 Tailwind 设计 token 对齐。

## 常用组件模板

### Modal / Drawer

- 尺寸与圆角、阴影：用 `styles={{ content: { borderRadius, boxShadow, padding: 0 }, body: { ... } }}`。
- 不要用 `className` 直接改 `.ant-modal-content`，用 `styles.content`。

### Form

- 表单项布局用 `layout="vertical"` 或 `horizontal`，间距用 Form 的 `className`（Tailwind）包一层。
- 单表单项样式用 `Form.Item` 的 `className` 或子组件 `styles`。

### Table

- 列定义用 `columns`，`key` 与数据字段一致；分页用 `pagination={{ ... }}`。
- 表格容器宽度用 Tailwind；表格内部样式用 `styles` / `classNames`。

### Select / Input / DatePicker

- 外层用 Tailwind 控制宽度、间距；组件自身用 antd 的 `className`、`styles` 做细微调整。
- 禁止用 Tailwind 类覆盖 `.ant-select-selector` 等内部节点，改用 `styles` 或 `classNames`。

## 与 Rules 的配合

- 全局 Rule：`antd-tailwind-integration.mdc`（Antd + Tailwind 集成规范）与本 Skill 一致，生成代码时同时遵守。
