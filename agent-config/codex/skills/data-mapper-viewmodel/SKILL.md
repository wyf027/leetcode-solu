---
name: data-mapper-viewmodel
description: 数据分层实践 SOP。解决"接口数据怎么流入组件、表单数据怎么流出提交"的代码组织问题，含四层同步 SOP、数据流图、回填/提交方向。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 数据分层实践：types / mapper / viewModel / payload / 回填

## 这个 skill 解决什么代码问题

解决"接口数据怎么流入组件、表单数据怎么流出提交"的代码组织问题。
当你不确定数据应该在哪层转换、新字段要改哪几个文件时，用这个 SOP。

## 适用场景

- 字段新增：后端加了字段，前端需要展示 / 采集 / 提交
- 表单回填：编辑页需要把接口数据回填到 antd Form
- 热修：数据展示不对、提交字段缺失、字段映射错误
- AI 改代码：约束 AI 不在组件中直接消费 raw response
- 新页面接入：建立数据流通路

## 项目中的规范入口

本项目的数据流分层体现在以下目录和文件中：

```
types/<domain>/index.ts               ← DTO 类型（对应后端字段）
types/common/jobPreview.ts            ← ViewModel（对应 UI 消费）
hooks/<domain>/mappers.ts             ← mapper 函数集合
  ├── mapDetailToStepA/B/C            ← API → Form 回填
  ├── mapStepAToConfigParams          ← Form → API payload
  ├── toStringArray / formatDate      ← 工具转换
  └── deriveMaterialFiles             ← 派生计算
hooks/<domain>/useXxxPage.ts          ← 调用 mapper 的消费层
components/<domain>/XxxView.tsx       ← 只接 ViewModel
```

关键设计决策（项目中已实现的）：

- `JobPreviewViewModel`（`types/common/jobPreview.ts`）是独立的视图模型，注释写明"组件不依赖任何接口原始结构"
- mapper 文件头注释引用后端 DTO 类名（如 `JobBasicInfoDto.java`），方便联调时对照
- 枚举标签映射统一在 mapper 中维护（如 `EDUCATION_LABELS`、`RECUIT_TYPE_LABELS`）（命名沿用项目既有拼写）

## 推荐分层方式

### 数据流图

```
┌─────────────────────────────────────────────────┐
│                 API Response (raw)               │
└──────────────────────┬──────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│        mapper / normalize（mappers.ts）           │
│  - 字段 fallback（null → 默认值）                  │
│  - 枚举 → 标签（1 → "社招全职"）                   │
│  - Long ID → string                              │
│  - 嵌套结构 → 扁平 ViewModel                      │
└──────────────────────┬──────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│       ViewModel / FormData（types/）              │
│  - 只含 UI 需要的字段                              │
│  - 所有字段有确定类型（不 nullable）                 │
└──────────────────────┬──────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│              Component（props）                   │
│  - 只渲染、只触发事件                               │
│  - 不做字段 fallback                               │
└──────────────────────────────────────────────────┘
```

### 提交方向

```
┌──────────────────────────────────────────────────┐
│         antd Form values                         │
└──────────────────────┬──────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│     payload builder（mapXxxToConfigParams）       │
│  - Form 值 → API 需要的结构                        │
│  - 日期格式化（dayjs → YYYY-MM-DD）                │
│  - 数组 → 逗号分隔字符串                            │
│  - 补充非表单字段（如 jobId）                        │
└──────────────────────┬──────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│          service 函数调用                          │
└──────────────────────────────────────────────────┘
```

## 开发 SOP

**新增字段时（从下到上）：**

1. **types**：在 DTO interface 中添加字段声明，在 ViewModel 中添加 UI 消费字段
2. **mapper（展示方向）**：在 `mapDetailToXxx` / normalize 中添加从 raw 到 ViewModel 的映射
3. **mapper（提交方向）**：在 `mapXxxToParams` 中添加从 FormData 到 payload 的映射
4. **mapper（回填方向）**：在 `mapDetailToStepXxx` 中添加 API → Form initialValues 的映射
5. **component**：消费新的 ViewModel 字段 / FormData 字段
6. **验证**：检查展示、回填、提交三个方向都覆盖

**排查字段展示异常：**

1. 先看组件 → 确认接收了哪个 prop
2. 再看 mapper → 确认 raw → ViewModel 的转换是否正确
3. 再看 types → 确认字段名和类型是否与后端一致
4. 最后看 service → 确认接口返回的原始数据结构

## 常见反模式

### 反模式 1：组件中做 raw 字段 fallback
```tsx
// 错误
<div>{data.jobMetadata?.title || '未命名'}</div>
```
**正确做法**：在 mapper 中 `title: meta?.title || '未命名职位'`，组件直接用 `data.title`。

### 反模式 2：page 中手拼 payload
```tsx
// 错误
const payload = {
  title: form.getFieldValue('title'),
  city: form.getFieldValue('city'),
  // ...20 个字段
};
await saveJob(payload);
```
**正确做法**：使用 `mapStepAToConfigParams(formValues)` 统一生成。

### 反模式 3：回填时直接用 raw response
```tsx
// 错误
form.setFieldsValue(apiResponse.data);
```
**正确做法**：`form.setFieldsValue(mapDetailToStepA(apiResponse.data))`。

### 反模式 4：多处各自做不同 fallback
```tsx
// 组件 A
{salary || '面议'}
// 组件 B
{salary || '暂无'}
// 组件 C
{salary ?? '-'}
```
**正确做法**：mapper 统一 `salary: raw.salary || '面议'`，所有组件消费同一值。

### 反模式 5：mapper 中有副作用
```ts
// 错误 — mapper 不应弹 toast
function mapData(raw: ApiDto) {
  if (!raw.title) message.warning('标题为空');
  return { ... };
}
```

## 热修时优先改哪层

1. **首选：mapper 层**（纯函数，修改后影响面最小，可快速验证输入 → 输出）
2. **次选：types 层**（补齐缺失的类型声明）
3. **慎改：组件展示层**（可能影响其他消费同一 ViewModel 的组件）
4. **尽量不动：service 层**（改 service 意味着接口契约可能变化）

## 回归检查项

- [ ] 新字段在 types 中声明
- [ ] 新字段在 mapper（展示方向）中映射
- [ ] 新字段在 mapper（提交方向）中打包
- [ ] 新字段在 mapper（回填方向）中适配
- [ ] nullable 字段在 mapper 中有兜底
- [ ] 组件不直接做 raw 字段 fallback
- [ ] mapper 函数无副作用

## 不适用场景

- 纯展示静态文本页（无接口数据流入），无需 mapper
- 前端独立计算的 UI 状态（如 Tab 索引、展开收起），不经过 mapper
- 第三方 SDK 数据（如地图坐标），映射方式由 SDK 决定

## 输出要求

- 新增字段时，给出 types / mapper(展示) / mapper(提交) / mapper(回填) 四层的具体改动代码
- 明确指出哪些文件需要修改及修改顺序

## 信息不足时先确认

- 该字段的后端字段名和类型是什么？（决定 DTO 定义）
- 该字段是否 nullable？（决定 mapper 兜底逻辑）
- 该字段是否需要提交回后端？（决定是否需要 payload builder 适配）

## 适合给 Cursor 的提示模板

```
本项目数据流规范：
- API 原始响应必须经过 mapper 转换为 ViewModel 后才能传入组件
- mapper 放在 hooks/<domain>/mappers.ts，必须是纯函数
- 表单提交必须使用 payload builder（如 mapXxxToParams），不在 page/组件中手拼
- 表单回填必须使用 mapDetailToXxx 转换后再 setFieldsValue
- 新增字段需要同步修改：types → mapper(展示) → mapper(提交) → mapper(回填) → component
- 所有 nullable 字段在 mapper 中统一兜底，组件不做 fallback
```
