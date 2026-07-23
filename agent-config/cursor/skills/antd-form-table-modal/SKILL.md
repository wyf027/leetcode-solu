---
name: antd-form-table-modal
description: 快速生成 antd 表单+表格+弹窗的中后台页面结构，包含 Form、Table、Modal 标准写法与状态划分，与 Tailwind 布局配合。
license: MIT
metadata:
  author: cursor-global-config
  version: "1.0.0"
---

# antd 表单+表格+弹窗页面（Skill）

在用户要求“做一个带表格和弹窗的页面”“列表页带筛选表单和新增弹窗”“中后台 CRUD 页”时使用本 Skill，输出符合分层与 antd 用法的标准结构。

## 何时应用

- 用户说“生成一个表格+弹窗的列表页”“带 Form 筛选和 Table 和新增/编辑 Modal”时
- 用户给出实体名（如“岗位列表”“成员管理”）并要求按中后台标准搭建时
- 需要区分“筛选表单 / 表格 / 弹窗表单”的状态与职责时

## 输入时适合给 Agent 的一句话指令示例

- “用 antd-form-table-modal 生成一个岗位列表页：顶部筛选（表单）、下面 Table、点新增打开 Modal 表单。”
- “按 antd + Tailwind 做一个成员管理页，要搜索、表格、编辑弹窗。”

## 必须输出的结构

1. **页面层**（如 `page.tsx`）：只调一个聚合 Hook（如 `useXxxPage`），将 `list`、`loading`、`pagination`、`handlers`（打开弹窗、提交、关闭、筛选、分页）传给子组件；不在此写业务逻辑与 API 调用。
2. **筛选区**：使用 antd `Form`，布局用 Tailwind 容器（如 `flex gap-4`）；表单项用 `Form.Item` + `Input`/`Select`/`DatePicker` 等；提交/重置按钮用 antd `Button`；不写 `.ant-*` 覆盖，样式用 `styles`/`classNames`。
3. **表格**：antd `Table`，`columns` 单独定义并带类型；`dataSource`、`loading`、`pagination` 从 Hook 传入；行操作（编辑、删除）用按钮或 Dropdown，回调通过 props 传入。
4. **弹窗**：antd `Modal`，`open`、`onCancel`、`footer` 受控；内容区为 `Form`（新增/编辑）时，用 `Form` 的 `form` 实例与 `onFinish`；提交成功后执行传入的 `onSuccess`（如关闭弹窗、刷新列表）；Modal 样式优先使用 antd 提供的样式扩展能力或项目既有封装方式，布局用 Tailwind 包一层。
5. **Hook 层**：数据获取与提交状态由页面级 Hook 或容器层统一管理；聚合 Hook 内包含列表数据、筛选/分页状态、弹窗 open 状态、提交 mutation，handlers 用 useCallback，返回类型清晰并遵循项目既有风格。
6. **类型**：列表项、表单值、API 入参/出参用 TypeScript 类型定义在 types 层或同文件上方；禁止 any。

## 与 Rules 的配合

- 遵守 `antd-tailwind-separation`：布局 Tailwind，组件样式 antd API。
- 遵守 `component-decoupling`：page 只调 Hook+渲染，逻辑在 Hook，展示在组件。
- 遵守 `quality-gate`：生成后执行项目当前使用的格式化与 lint 检查。

## 输出格式

- 按“目录/文件 + 完整代码”给出；若项目已有 `useXxx`、`getXxx` 命名风格，说明“请替换为项目内已有 Hook/Service 命名”。
