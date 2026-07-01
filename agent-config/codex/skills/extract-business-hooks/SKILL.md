---
name: extract-business-hooks
description: 从大组件中识别并提取业务 hooks，将 state、effect、请求、回调抽成独立 Hook 文件，保留组件仅负责渲染与事件绑定。
license: MIT
metadata:
  author: cursor-global-config
  version: "1.0.0"
---

# 从大组件中提取业务 Hooks（Skill）

在用户要求“把这段组件里的逻辑抽成 Hook”“从 Xxx 组件里提取数据请求和状态到 Hook”时使用本 Skill，按步骤输出提取方案与代码。

## 何时应用

- 用户贴出或指定一个较大组件，要求“抽成 Hook”时
- 用户说“这个组件太臃肿，把请求和状态拆出去”时
- 需要区分“哪些 state/effect 属于业务逻辑、哪些属于纯 UI 状态”时

## 输入时适合给 Agent 的一句话指令示例

- “用 extract-business-hooks 把 `components/workflow/ScheduleModal.tsx` 里的数据请求和表单状态抽成一个 useScheduleModal Hook。”
- “从这个大组件里提取业务 hooks，保留组件只做渲染。”

## 必须执行的步骤

1. **识别边界**：列出组件内所有 `useState`、`useEffect`、`useCallback`、`useMemo` 以及直接调用的 API/Service；区分“业务逻辑”（与后端、领域规则、多步骤流程相关）与“纯 UI 状态”（如弹窗 open、input 受控）。
2. **设计 Hook 接口**：新 Hook 的返回值用 interface 定义：`{ data, loading, error, handlers }` 等；handlers 为具名回调（如 `onSubmit`、`onClose`），不暴露 setState。
3. **抽离**：将业务 state、effect、请求、派生数据移入新 Hook；组件内只保留“调用 Hook + 将返回值与 handlers 传给 JSX”；若存在多个可独立复用的逻辑块，可拆成多个 Hook 再在组件或另一个聚合 Hook 中组合。
4. **文件位置**：新 Hook 放在 `hooks/` 下，与业务域对齐（如 `hooks/buser/useScheduleModal.ts`）；若项目有 baseHooks + 聚合 Hook 的惯例，说明“可进一步拆成 baseXxx + useXxxPage”。
5. **类型**：Hook 的入参、返回值、内部回调参数均使用 TypeScript 类型；不引入 any。
6. **不破坏行为**：提取后组件对外 Props 与行为保持不变（相同输入相同输出）；如有依赖顺序变化，在注释中说明。

## 与 Rules 的配合

- 遵守 `component-decoupling`：单职责、Props 最小化。
- 遵守 `typescript-strict-first`：Hook 返回类型显式、无 any。
- 遵守 `quality-gate`：对新增/修改文件执行项目当前使用的格式化与 lint 检查。

## 输出格式

- 先给“提取方案”短列表（哪些 state/effect 进 Hook、Hook 命名与入参/返回值），再给 Hook 文件与修改后组件的完整代码；若组件混合多类职责，除抽离 Hook 外，评估是否进一步拆分展示子组件，并说明依据。
