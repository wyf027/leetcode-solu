---
name: page-hook-layering
description: page / 聚合 hook / 子组件分层实践 SOP。解决"代码应该写在 page 还是 hook 还是 component"的判断问题，含开发 SOP、反模式、热修优先级。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 页面层 / 聚合 Hook / 子组件 分层实践

## 这个 skill 解决什么代码问题

解决"代码应该写在 page 还是 hook 还是 component"的判断问题。
当你不确定新逻辑放在哪层时，用这个 SOP 做决策。

## 适用场景

- 新功能开发：需要新增页面或在已有页面添加逻辑
- 新页面接入：搭建新的 `app/**/page.tsx`
- 热修：定位逻辑应该在哪层修改
- AI 改代码：约束 AI 不在 page 中堆业务逻辑
- 代码评审：检查分层是否合理

## 项目中的规范入口

本项目的分层约定体现在以下结构中：

```
app/buser/xxx/page.tsx               ← 视图编排层
hooks/buser/xxx/useXxxPage.ts        ← 聚合 hook（业务编排）
hooks/buser/xxx/baseHooks.ts         ← 基础 hook（可跨页面复用）
hooks/buser/xxx/mappers.ts           ← 数据转换（纯函数）
hooks/buser/xxx/index.ts             ← barrel export
components/buser/xxx/XxxComponent.tsx ← 子组件（纯展示 + 事件触发）
types/buser/xxx/index.ts             ← 类型定义
```

聚合 hook 的 barrel export 模式（参考 `hooks/buser/jobsCreate/index.ts`）：
```
export { useXxxPage } from './useXxxPage';    // 聚合 hook
export { ... } from './baseHooks';            // 基础 hooks
export { ... } from './mappers';              // 数据转换
```

## 推荐分层方式

### page 层职责

| 可以做 | 不可以做 |
|--------|----------|
| 调用 `useXxxPage()` 聚合 hook | 直接调用 service / axios |
| 创建 `Form.useForm()` 实例 | 定义包含请求 / payload / 错误处理的 handler |
| 组装子组件、传递 props | 使用 `useEffect` 发请求 |
| 简单的纯 UI 状态（当前 Tab、子步骤索引） | 管理 loading / error / modal 等业务状态 |
| 将 hook 回调透传或轻量包装给子组件 | 自行实现提交校验、弹窗逻辑 |

### 聚合 hook 层职责

| 可以做 | 不可以做 |
|--------|----------|
| 调用 service 发请求 | 直接返回 JSX |
| 管理 loading / error / modal 状态 | 操作 DOM |
| 调用 mapper 转换数据 | 直接渲染 UI |
| 提供 handleXxx 回调给 page | 同时给多个不相关页面服务 |
| 调用 `checkResCode` 处理业务错误 | 对同一错误重复 toast |

### 子组件层职责

| 可以做 | 不可以做 |
|--------|----------|
| 通过 props 接收数据和回调 | 直接调用 service |
| 触发 `onXxx` 事件 | 直接操作 zustand store |
| 管理纯 UI 内部状态（展开/收起） | 拼接 payload |
| 使用项目样式常量 | 做 API raw 字段 fallback |

## 开发 SOP

**新增页面时：**

1. 先创建 `types/<domain>/` 中的类型定义
2. 创建 `hooks/<domain>/useXxxPage.ts` 聚合 hook，定义返回类型 `UseXxxPageReturn`
3. 创建 `hooks/<domain>/baseHooks.ts` 放可复用的子 hook
4. 创建 `hooks/<domain>/mappers.ts` 放数据转换函数
5. 创建 `hooks/<domain>/index.ts` barrel export
6. 创建 `app/<domain>/xxx/page.tsx`，只调用聚合 hook + 编排子组件
7. 创建 `components/<domain>/xxx/` 下的子组件

**在已有页面添加逻辑时：**

1. 先看聚合 hook 是否已有相关状态或回调
2. 如果没有 → 在聚合 hook 中新增，通过返回值暴露
3. 子组件通过 props 消费新数据
4. 不要在 page 层加逻辑"快速解决"

## 常见反模式

### 反模式 1：page 里堆业务逻辑
```tsx
// 错误 — page 中直接发请求和处理错误
export default function XxxPage() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.getData().then(setData).catch(err => message.error(err));
  }, []);
  // ...
}
```
**正确做法**：把请求和错误处理移到聚合 hook。

### 反模式 2：子组件直接读 store
```tsx
// 错误 — 子组件直接依赖 store
function XxxCard() {
  const { companyInfo } = useBUserStore();
  return <div>{companyInfo.name}</div>;
}
```
**正确做法**：由 hook 读取 store，通过 props 传入子组件。

### 反模式 3：双重 toast
```tsx
// 错误 — hook 和 page 各弹一次
// hook 中
async function handleSubmit() {
  try { ... } catch (err) { message.error('提交失败'); throw err; }
}
// page 中
try { await handleSubmit(); } catch { message.error('操作失败'); }
```
**正确做法**：hook 层通过 `checkResCode` 处理业务错误（已含 toast），catch 中用 `isBusinessError` 跳过已处理的，只对网络异常 toast。page catch 只做收尾，不弹 toast。详见 04-service-request-auth。

## 热修时优先改哪层

1. **首选：hook 层**（改逻辑、改数据处理）— 影响面可控，不影响组件 props 接口
2. **次选：mapper 层**（改数据转换）— 纯函数，回归范围最小
3. **慎改：page 层**（改编排方式）— 可能影响子组件渲染
4. **尽量不动：组件 props 接口**（改 interface）— 需要同步修改所有消费方

## 回归检查项

- [ ] page 文件只有编排逻辑，无业务代码
- [ ] 聚合 hook 返回类型有明确 interface
- [ ] 子组件只通过 props 接收数据
- [ ] 同一状态只在一处维护
- [ ] toast / 错误提示不重复
- [ ] barrel export `index.ts` 是否需要更新

## 不适用场景

- 纯静态展示页（无交互、无请求），无需引入聚合 hook
- 极简页面仅需 1~2 个轻量 state 且无请求，可不强制拆 hook
- 第三方嵌入页（如 iframe 宿主页），分层方式由宿主框架决定

## 输出要求

- 新建/修改 page 文件时，说明该文件中哪些逻辑属于编排、哪些需移至 hook
- 给出修改后 page、hook、component 三层文件的变更清单

## 信息不足时先确认

- 当前页面是否已有聚合 hook？名称是什么？
- 需要新增的逻辑属于业务 handler 还是纯 UI 交互？
- 该组件是否被多个 page 消费？

## 适合给 Cursor 的提示模板

```
请遵循本项目的分层规范：
- page 只做编排，不写业务逻辑，不直接调用 service
- page 可保留：Form.useForm()、纯 UI 状态（Tab 索引）、hook 回调的透传包装
- page 禁止：请求发起、payload 构造、错误处理、弹窗逻辑
- 业务逻辑放在 hooks/<domain>/useXxxPage.ts 聚合 hook 中
- 子组件只接 props，不发请求，不操作 store
- 聚合 hook 必须有明确的返回类型 UseXxxPageReturn
- 数据转换放在 hooks/<domain>/mappers.ts 中（纯函数）
- 错误处理链：hook 层 checkResCode 处理业务错误 → catch 中 isBusinessError 跳过已处理的 → page catch 只做收尾不弹 toast
```
