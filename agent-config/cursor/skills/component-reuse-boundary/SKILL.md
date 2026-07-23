---
name: component-reuse-boundary
description: 公共/业务/页面组件抽象边界实践 SOP。解决"该抽组件还是直接写"、"props 怎么设计"、"通用组件能不能依赖 store"等问题。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 公共组件 / 业务组件 / 页面组件 抽象边界实践

## 这个 skill 解决什么代码问题

解决"这段 UI 该抽组件还是直接写""组件 props 怎么设计不过度也不欠缺""通用组件能不能依赖 store"等组件设计问题。

## 适用场景

- 新功能开发：需要决定是新建组件还是复用已有
- 公共组件复用：需要判断组件的复用边界
- 代码评审：检查组件职责是否单一、props 是否最小
- 热修：修改组件时评估影响面
- AI 改代码：约束 AI 不创建过度抽象或过度耦合的组件

## 项目中的规范入口

```
components/common/           ← 跨领域通用组件
  ├── Fallback.tsx           ← 加载 / 错误兜底
  ├── MenuLayout.tsx         ← 侧栏布局
  ├── TopBar.tsx             ← 顶部栏
  ├── ConfirmDeleteModal.tsx ← 确认删除弹窗
  ├── UserAvatar.tsx         ← 用户头像
  └── JobShareEntry.tsx      ← 分享入口（含 Modal）

components/buser/<module>/   ← B 端业务组件
components/cuser/<module>/   ← C 端业务组件
components/share/            ← 分享/开放场景组件
components/login/            ← 登录流程组件
```

本项目已有的复用模式：
- **`hideFooter` props**：组件通过 boolean props 控制是否显示某个区域，实现不同场景复用
- **`form?: FormInstance` 可选注入**：允许外部注入 Form 实例，默认内部创建
- **`mode` props**：如 `useJobDetailPage({ mode: 'public' | 'internal' })`，用枚举控制行为分支

## 推荐组织方式

### 三级分类决策

```
这个组件被几个领域使用？
├── 跨领域（B 端 + C 端 + 分享页）→ components/common/
├── 同领域内多个模块 → components/<domain>/common/ 或 components/<domain>/shared/
└── 只在一个模块内 → components/<domain>/<module>/
```

### props 设计原则

```
最小接口：只暴露消费方需要的字段
  ✓ title: string
  ✗ data: ApiResponse（把整个 response 传进去）

差异化控制：用 boolean / enum props 控制可选行为
  ✓ hideFooter?: boolean
  ✓ mode?: 'compact' | 'full'
  ✗ 为每个场景复制整个组件

可选注入：外部可控制但不强制
  ✓ form?: FormInstance（默认内部创建）
  ✓ className?: string（允许外部追加样式）
```

### 拆分时机

```
单文件超过 300 行 → 必须评估拆分
同时包含 3 种以上职责 → 必须拆分
  - 数据获取 / 状态编排 / 渲染映射 / 副作用 / 提交动作
组件内有 4+ 个 useEffect 且依赖耦合 → 必须拆分为子组件或 hook

常见拆分方式：
  XxxForm.tsx → XxxFormFields.tsx + XxxFormFooter.tsx
  XxxList.tsx → XxxList.tsx + XxxCard.tsx + XxxEmptyState.tsx
```

## 开发 SOP

**判断是否需要抽组件：**

1. 这段 UI 是否出现了 2 次以上？
   - 是 → 考虑抽取
   - 否 → 先不抽，就近放在 page 或父组件中
2. 如果抽取，被几个领域使用？
   - 跨领域 → `components/common/`
   - 单领域 → `components/<domain>/<module>/`
3. 这个组件需要业务数据还是只需要 UI 数据？
   - 需要业务数据 → 业务组件，放在对应 domain 下
   - 只需要 UI 数据 → 通用组件，不依赖 store 和业务 types

**修改已有组件时：**

1. 先确认这个组件有几个消费方 → `rg 'import.*XxxComponent' components/ app/`
2. 消费方 > 1 → 修改 props 时考虑向后兼容（新增可选字段、不删已有字段）
3. 消费方 = 1 → 可以较自由地重构

**组件文件过大时：**

1. 识别职责边界 → 展示区 / 操作区 / 表单区 / 列表区
2. 按区域拆分子组件
3. 状态管理提升到父组件或 hook
4. 子组件通过 props 接收数据

## 常见反模式

### 反模式 1：通用组件依赖业务 store
```tsx
// 错误 — common 组件不应知道 useBUserStore
import { useBUserStore } from '@/store/useBUserStore';

export function CommonHeader() {
  const { companyInfo } = useBUserStore();
  return <div>{companyInfo.name}</div>;
}
```
**正确做法**：通过 props 传入 `companyName: string`。

### 反模式 2：为一次使用强行抽象
```tsx
// 错误 — 只用一次的 UI 块没必要独立为公共组件
// components/common/DashboardWelcomeCard.tsx
```
**正确做法**：直接写在 page 或对应的业务组件中。

### 反模式 3：复制整个组件做微调
```
// 错误 — 复制 StepB.tsx 为 StepBOpenPage.tsx，只改了几行
```
**正确做法**：`StepB` 增加 `hideFooter` prop 控制差异。

### 反模式 4：props 中传 API response 对象
```tsx
// 错误
<JobCard data={apiResponse.data} />
```
**正确做法**：传 ViewModel 字段或必要的 primitive 属性。

### 反模式 5：组件内部发请求
```tsx
// 错误 — 业务组件不应自行发请求
function XxxCard({ id }: { id: string }) {
  const [data, setData] = useState(null);
  useEffect(() => { fetchData(id).then(setData); }, [id]);
}
```
**正确做法**：由 hook 层请求，通过 props 传入 data。

## 热修时优先改哪层

1. **首选：组件内部渲染逻辑**（不改 props 接口，影响面最小）
2. **次选：增加可选 props**（向后兼容，已有消费方不受影响）
3. **慎改：修改必选 props**（所有消费方都需要更新）
4. **尽量不动：组件目录位置**（改路径影响所有 import）

## 回归检查项

- [ ] 通用组件不依赖业务 store / 业务 types
- [ ] 业务组件只通过 props 接收数据
- [ ] 复用通过 props 差异化控制而非复制组件
- [ ] props 只暴露必要属性
- [ ] 单文件不超过 300 行
- [ ] 组件内无直接的 service 调用

## 不适用场景

- 一次性的原型 / Demo 页面，无复用需求时不必强制抽组件
- 第三方组件的内部结构调整（如 antd Modal 内部），不适用本项目抽象规则
- 纯 hook 逻辑拆分（参考 page-hook-layering skill）

## 输出要求

- 建议抽组件时，给出 props interface 定义 + 文件放置路径
- 说明该组件属于 common / domain / page 级别及原因

## 信息不足时先确认

- 该 UI 片段有几个消费方？是否跨领域？
- 已有类似组件吗？名称是什么？

## 适合给 Cursor 的提示模板

```
本项目组件规范：
- components/common/ 放跨领域通用组件，不依赖业务 store
- components/<domain>/<module>/ 放业务组件，只通过 props 接收数据
- 复用优先于复制，通过 hideXxx / mode 等 props 控制差异
- 单文件超过 300 行必须拆分
- 组件不直接调 service 发请求
- props 设计最小化，不传整个 API response
- 同一 UI 出现 2 次以上再考虑抽取为独立组件
```
