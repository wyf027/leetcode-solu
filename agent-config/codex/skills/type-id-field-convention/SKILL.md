---
name: type-id-field-convention
description: 类型定义与 Long ID 实践 SOP。解决"ID 转 number 尾数变 0"、"Select 选中值和 form 值不一致"、"后端加字段前端没声明"等问题。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 类型定义、Long ID、字段命名、接口映射实践

## 这个 skill 解决什么代码问题

解决"新字段的类型放哪里""ID 转成 number 尾数变 0""Select 选中值和 form 值不一致""后端加字段前端没声明导致 undefined"等问题。

## 适用场景

- 字段新增：后端加了字段前端需同步
- 表单联调：Select / Form / payload 的值类型不一致
- 热修：ID 精度丢失、字段展示 undefined
- AI 改代码：约束 AI 不用 number 处理 Long ID
- 新页面接入：建立类型体系

## 项目中的规范入口

```
types/
├── buser/
│   ├── jobsCreate/index.ts    ← DTO + FormData + 枚举 union
│   └── onboarding.ts
├── cuser/
│   ├── jobManagement.ts
│   └── resume.ts
├── common/
│   ├── jobPreview.ts          ← 跨端 ViewModel
│   ├── region.ts
│   └── upload.ts
├── login/
│   └── index.ts
└── typing.d.ts                ← 全局声明（IApiResponse 等）
```

本项目的类型约定：
- **枚举使用 union type**：`type RecuitType = 1 | 2 | 3 | 4`，不用 `enum`（示例沿用项目既有命名 `RecuitType`）
- **DTO 类型对应后端字段**：注释中引用后端 DTO 类名（如 `JobBasicInfoDto.java`）
- **ViewModel 类型对应 UI 消费**：只含 UI 需要的字段，所有字段有确定类型

## 推荐组织方式

### 类型文件分层

```
接口 DTO 类型（对应后端返回结构）
  → types/<domain>/index.ts

表单数据类型（对应 antd Form 字段）
  → types/<domain>/index.ts（与 DTO 同文件但独立定义）

ViewModel 类型（对应组件 props）
  → types/common/xxx.ts（跨端）或 types/<domain>/（单端）

API 请求参数类型
  → types/<domain>/index.ts

Hook 返回类型
  → types/<domain>/index.ts 或 hooks/<domain>/useXxxPage.ts 内
```

### Long ID 处理链路

```
后端返回 → Java Long → JSON number
前端接收 → normalize/mapper 中 String(id) → 全程 string
               ↓
         form value: string
         Select option.value: string
         payload 字段: string
         列表 key: string
         路由 params: string
```

### 枚举标签映射

```ts
// 在 mapper 文件中统一维护
export const EDUCATION_LABELS: Record<number, string> = {
  1: '不限',
  2: '大专及以上',
  3: '本科及以上',
  4: '硕士及以上',
  5: '博士及以上',
};
```

### Select option 值类型

```tsx
// 统一规则：option.value 类型 === form field value 类型

// 如果后端枚举是 number（1/2/3/4）
const options = [
  { label: '社招全职', value: 1 },  // value 是 number
];
// 则 Form.Item 的 initialValue 和 payload 也必须是 number

// 如果是 ID 类字段
const options = deptList.map(d => ({
  label: d.name,
  value: String(d.id),  // Long ID 必须转 string
}));
```

## 开发 SOP

**后端新增字段时：**

1. **types**：在对应 DTO interface 中添加字段（标注 nullable：`xxx?: string | null`）
2. **mapper**：在 normalize / mapper 中添加映射和兜底
3. **如果是 ID 字段**：在 mapper 中 `String(raw.newId)`
4. **如果是枚举字段**：在 mapper 中添加标签映射
5. **UI**：在组件中消费 ViewModel 中的新字段
6. **payload**：在 payload builder 中添加新字段

**排查"Select 选中后值不对"：**

1. 检查 option.value 的类型 → 是 number 还是 string？
2. 检查 form field 的 initialValue / value → 类型是否一致？
3. 检查 payload builder → 提交时是否做了类型转换？
4. 常见根因：option.value 是 number，但 form 回填时 API 返回的是 string（或反之）

**排查"ID 尾数变 0"：**

1. 检查 API 响应 → 原始 JSON 中 ID 是否超过 `2^53 - 1`？
2. 检查 normalize/mapper → 是否有 `String(id)` 转换？
3. 检查所有消费点 → 是否有 `Number(id)` / `parseInt(id)` / `+id`？
4. 检查 Select option.value → ID 是否为 string？

## 常见反模式

### 反模式 1：Number(id) 转换雪花 ID
```ts
// 错误 — 超过 Number.MAX_SAFE_INTEGER 时精度丢失
const numId = Number(jobId); // "1234567890123456789" → 1234567890123456800
```
**正确做法**：全程 `String(id)`。

### 反模式 2：Select value 和 form value 类型混用
```tsx
// 错误 — option.value 是 number，但 API 回填的是 string
<Select options={[{ label: '社招', value: 1 }]} />
// setFieldsValue({ recruitType: '1' })  ← string，与 number 不匹配
```
**正确做法**：统一为同一类型。

### 反模式 3：使用未声明的字段
```ts
// 错误 — TypeScript 不报错但运行可能 undefined
const title = (data as any).newField;
```
**正确做法**：先在 types 中声明字段。

### 反模式 4：用 enum 定义枚举
```ts
// 不推荐 — 本项目统一用 union type
enum RecuitType { ... }
```
**正确做法**：`type RecuitType = 1 | 2 | 3 | 4`，配合注释说明含义。
> 注：`RecuitType` 为项目既有命名，沿用以保持代码一致性。

### 反模式 5：DTO 类型直接当 props
```tsx
// 错误 — DTO 含冗余字段和 nullable
interface CardProps {
  data: ApiJobDetailResponse; // 不该传整个 DTO
}
```
**正确做法**：定义精简的 ViewModel 或直接列出需要的字段。

## 热修时优先改哪层

1. **首选：mapper 中的兜底逻辑**（修正 fallback、类型转换）
2. **次选：types 中补齐字段声明**（不影响运行时）
3. **慎改：组件中的字段消费**（可能需要同步改多个组件）
4. **尽量不动：Select option 值类型**（改了需要同步改 form 回填和 payload）

## 回归检查项

- [ ] 所有 ID 字段全程 string
- [ ] 无 `Number(id)` / `parseInt(id)` / `+id`
- [ ] Select option.value 和 form value 类型一致
- [ ] 新字段在 types 中声明
- [ ] nullable 字段在 mapper 中兜底
- [ ] 枚举标签映射在 mapper 中统一维护
- [ ] 无 `any` / `as any`

## 不适用场景

- 前端自生成的短 ID（如 UUID v4 用于列表 key），不存在精度丢失问题
- 纯展示文本字段（无 ID / 无枚举），不涉及类型映射
- 第三方 SDK 的类型定义，由 SDK 提供，无需自建

## 输出要求

- 新增字段时，给出 types 定义 + mapper 映射 + 组件消费三处改动
- 涉及 ID 字段时，标注"全程 string"并检查消费链路

## 信息不足时先确认

- 该字段的后端类型是什么？（Long / Integer / String）
- 该字段是否为 ID 类字段（需全程 string）？
- 该字段是否已在 types 中声明？

## 适合给 Cursor 的提示模板

```
本项目类型和 ID 规范：
- 所有 Long / 雪花 ID 全程 string，禁止 Number(id) / parseInt(id)
- 类型定义放 types/<domain>/，DTO 和 ViewModel 分开定义
- 枚举用 union type（type Xxx = 1 | 2 | 3），不用 enum
- Select option.value 与 form value 类型必须一致
- 新增字段必须在 types / mapper / UI / payload 四层同步
- nullable 字段在 mapper 中统一兜底，组件不做 fallback
- 禁止 any / as any，用 unknown + 类型守卫替代
```
