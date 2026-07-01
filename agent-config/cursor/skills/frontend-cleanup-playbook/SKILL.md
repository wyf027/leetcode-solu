---
name: frontend-cleanup-playbook
description: 前端 Cleanup 五轮执行手册。只讲 cleanup 步骤，不混 bug 修复。包含：五轮分轮策略（删冗余/收数据流/收状态/收交互/收质量）、每轮执行清单、诊断工具箱、风险评估表。使用前先通过 frontend-governance-core 判断任务类型。
license: MIT
metadata:
  author: zhangxia
  version: "1.3.1"
  suite: frontend-governance
  requires: frontend-governance-core/SKILL.md
---

> **frontend-governance v1.3.1（稳定版）** · 已冻结，进入实战验证阶段，禁止在执行任务时直接修改 skill / rule。

# 前端 Cleanup 五轮执行手册

**加载时机：** 任务类型判断为"整体 cleanup"或"定向优化（数据流/状态/UI/质量）"时加载。  
**职责：** 提供五轮分轮策略的完整执行清单。不包含 bug 修复流程（见 frontend-bugfix）。

**核心原则：先诊断，再分轮，每轮只做一件事，不混轮次。**

---

## 诊断工具箱（每轮开始前先跑）

**工具优先级：** `rg`（ripgrep）→ IDE 全局搜索（Ctrl+Shift+F）→ 手动阅读核心文件

```bash
# 双 toast 排查
rg "message\.(error|success|warning)" --type ts --type tsx

# Long ID 精度排查
rg "Number\(|parseInt\(" --type ts --type tsx

# 遗留调试代码
rg "console\.(log|warn|error)" --type ts --type tsx

# 类型污染
rg ": any" --type ts --type tsx

# 被压制的 warning
rg "eslint-disable" --type ts --type tsx
```

---

## 执行优先级与风险评估

| 改动类型 | 风险 | 建议 |
|---|---|---|
| 删死代码/unused import | 极低 | 先做 |
| 提取 mapper/normalize | 低 | 先做 |
| 合并 effects/chained effect | 低-中 | 验证逻辑等价后做 |
| 收敛 modal 状态 | 中 | 跟踪所有 open/close 路径 |
| 重构 loading 分层 | 中 | 确认所有 loading 消费点 |
| 大规模文件拆分 | 高 | 先确认边界再做 |
| 改接口契约 | 极高 | cleanup 不做 |

---

## 第一轮：删冗余

**目标：** 消除噪声，减少 diff 面积，让后续修改更清晰。  
**风险：极低。优先执行。**

执行清单：

1. **删死代码**：未被调用的函数、永远为 false 的 loading、注释掉的旧逻辑、未使用的 state
2. **删重复**：重复的 mapper、重复的 option 构造、重复的 payload 拼接、重复的错误处理
3. **删无意义 prop 穿透**：中间层只传递不使用的 prop（`_onXxx` 已标注废弃的）
4. **删无效 import**：删除代码后及时清理
5. **删测试/硬编码数据**：`contactEmail = 'test@...'` 此类测试遗留

**不做：** 不改业务逻辑，不改接口，不大规模重命名，不移动文件。

---

## 第二轮：收数据流（mapper / normalize / payload）

**目标：** 建立清晰的数据流管道，让数据在进入组件前即已稳定。

```
API 响应 → normalize → mapper → setFieldsValue（回填）
                               ↓
                        buildXxxParams（提交 payload）
```

执行清单：

### 1. 接口数据 → normalize（进入前端的唯一清洗点）
- 所有 API 响应进入页面/组件前，必须先经过 normalize 层
- normalize 统一处理：字段 fallback（null/undefined/空字符串）、枚举转换、Long ID 字符串化、字段别名合并
- 组件不允许直接消费原始 API 响应字段

### 2. 展示数据 → mapper（结构映射唯一出口）
- 建立独立 mapper 文件（`mappers.ts`）
- mapper 只做"字段优先级、fallback、格式化"，不做业务判断
- 候选人名称兜底链统一写在 mapper：`candidateName ?? name ?? email ?? '未知候选人'`

### 3. 表单回填 → 从 normalize 后结构回填
- `setFieldsValue` 数据来源必须是 mapper 后的稳定结构
- 禁止在 `setFieldsValue` 处直接拼装原始接口字段

### 4. 提交 payload → 唯一出口
- 建立 `buildXxxParams()` 作为唯一 payload 组装点
- 组件/页面层禁止手写 payload
- Long ID 一律 string 透传，禁止 `Number(id)` / `parseInt(id)` / `+id`

### 5. Long ID 治理
- Java Long / 雪花 ID 超过 JS `Number.MAX_SAFE_INTEGER`，全程 string 处理
- 表单 value、Select option value、列表 key 也必须是 string
- 接到原始响应后立即 `String(id)`，不允许进入任何数值计算

**诊断：**
```bash
# 找隐式数值转换
rg "Number\(.*[Ii]d\)|parseInt\(.*[Ii]d\)|\+\s*\w*[Ii]d" --type ts

# 检查 payload 是否在多处散落
rg "\{ userId:|\{ jobId:|\{ flowType:" --type ts
```

---

## 第三轮：收状态与副作用（hooks / modal / loading / error）

**目标：** 副作用边界清晰，状态来源单一，消除重复 toast 和 loading 联动问题。

执行清单：

### 1. Modal 状态唯一来源
- 所有弹窗的 open/close 状态只存在于一处（controller hook 层）
- 禁止 page / 组件 / 子组件各自维护一份 open 状态
- 打开/关闭必须有统一入口（`openXxx` / `closeXxx`）
- 关闭时统一 reset（表单 + 业务 state），禁止关闭后残留上次数据

### 2. Loading 分层，单一来源
区分三类，各自只有一处维护：
- **列表/页面级 loading**（由列表接口控制）
- **弹窗详情 loading**（由详情接口控制，显示为 Spin/skeleton）
- **提交 loading**（由提交动作控制，显示在按钮上）

不允许：同一请求多处维护 loading、永远为 false 的 loading、有 loading 但无消费。

### 3. 副作用边界：谁发请求，谁处理
- 每个请求只有一处 toast 处理（success + error）
- 不允许 hook 和页面都 catch 同一个错误并各自 toast
- 通用错误兜底在 hook 层，页面层 try-catch 只做无 toast 逻辑（如跳转）

### 4. 禁用/前置校验前移到 hook 层
- `noCandidateSelected`、`isDetailFilled`、冷却期判断等在 hook 里计算，暴露 boolean
- 组件只消费 boolean 结果（`disabled`），不在组件里重复写 if 判断

### 5. Chained Effect 消除
- 避免：请求 → 存 state → 另一个 effect 响应 state 变化 → 填表单
- 改为：请求 → 在 `.then()` 里直接调用填表函数

### 6. 统一 handler 控制面
- 页面层 handler 集中在一个 controller hook（`useXxxPage`）中暴露
- 同一业务动作不允许多套 handler
- 删除空 `useCallback(() => {})` 和无消费 handler

**诊断：**
```bash
# 双 toast 排查
rg "message\.(error|success)" --type ts -n

# Chained effect 排查
rg "useEffect\(" --type ts -A 5

# 多处维护同一 loading
rg "setLoading" --type ts -n
```

---

## 第四轮：收交互一致性与边界兜底

**目标：** 用户体验一致，空值不出现白屏，未实现能力不误导用户。

执行清单：

### 1. Loading / Empty / Error 态统一
- 所有核心数据入口的三态处理方式一致：
  - loading：统一 Spin 或 Skeleton
  - empty：有明确文案，引导用户下一步
  - error：toast 或 inline 提示，说明原因和操作方式
- 不允许 A 入口有 Spin，B 入口白屏

### 2. Nullable 字段统一兜底
- 所有渲染字段明确写出兜底：`data.startTime ?? '-'`
- 数字计算前先判空：`score != null ? score.toFixed(2) : '-'`
- 禁止直接渲染可能为 null 的字符串字段

### 3. 弹窗边界统一处理
- 打开前数据不完整：disabled + 引导文案
- 打开后接口未回填：Spin 遮罩 + submit disabled
- 接口回填失败：submit disabled + 明确文案 + cancel 始终可关闭
- 关闭时：`resetForm` + `clearDetail` + `clearOptions` 三者同步清理
- 禁止关闭弹窗后 submit 因残留 loading 而被锁死

### 4. 未实现入口统一处理
- 未实现功能：要么隐藏，要么 disabled + Tooltip 说明"功能开发中"
- 禁止留下"点了没反应"的按钮
- noop 函数必须有注释：`// 功能暂未实现，预留占位`

### 5. Upload / Form / Select 复杂组件边界
- Upload：原始 `UploadFile` 对象不得进入业务态；提交前只取 `originFileObj` 或已上传 URL
- Select：option.value / form value / payload field 类型三者必须一致
- Form 回填：数据来自 normalize 后结构，不直接用 API raw 字段

---

## 第五轮：代码质量与稳定性收敛

**目标：** 消除隐式类型风险、竞态问题、Hook 纯度问题，删除无意义性能"优化"。  
**执行时机：** 前四轮完成、代码结构已稳定后执行。

执行清单：

### 1. 类型收紧（消除 any / 宽类型）

- 搜 `: any`、`as any`、`Record<string, unknown>`，逐一替换为精确类型
- 接口响应类型：用泛型约束，不用 `any` 做过渡
- 公共 Hook 入参和返回值必须有明确 interface
- `as` 断言：只允许在有明确根据的边界使用，且有注释说明
- 优先用类型守卫（`is` 谓词、`in` 操作符）代替断言

**达标标准：**
- `rg ": any"` 结果为 0，或剩余均有注释说明不可避免的原因
- `rg "unknown as "` 结果为 0
- mapper 层所有函数有明确入参和返回值类型
- domain hook 的 `UseXxxReturn` interface 完整声明所有返回字段
- `buildXxxParams()` 有明确的入参和返回值类型

### 2. 副作用安全（竞态 / unmount 后 setState）

- 异步请求在组件卸载后不得执行 setState：使用 `AbortController` 或 `ignore` flag
- 并发请求场景（搜索 debounce）：确保只使用最新请求结果

```typescript
useEffect(() => {
  let ignore = false;
  fetchData().then((data) => {
    if (!ignore) setState(data);
  });
  return () => { ignore = true; };
}, [deps]);
```

**必须检查：**
- useEffect 内有异步操作：是否有 `return () => { ignore = true }` 或 AbortController
- 搜索/debounce 场景：是否有 stale closure 问题

### 3. 表单一致性（不可变 / 无残留）

- 每个表单生命周期完整：open → init/prefill → submit/cancel → reset
- `resetFields` 或 `setFieldsValue({})` 在关闭时必然执行
- 默认值使用工厂函数（`getDefaultFormState()`），不共享同一对象引用

### 4. Hooks 纯度（不混 UI / 不泄漏 state）

- Hook 不返回不被任何消费者使用的 state（dead return）
- 不应返回不该被外层直接调用的 setter
- 无 JSX 引用（import React、返回 ReactNode）
- `useCallback` deps 与实际闭包一致，不靠 eslint-disable 压制

**达标标准：**
- 返回值中无组件不应直接调用的 setter
- 无 JSX 引用
- 不直接调用 DOM API（除非明确是 DOM Hook）

### 5. 删除无意义优化（memo 滥用）

- `useMemo` 只用于：开销明显的计算、稳定引用（作为 useEffect 的 dep）
- `useCallback` 只用于：作为 prop 传给 `React.memo` 子组件、作为 useEffect 的 dep
- 对字符串拼接、简单条件表达式加 `useMemo` 是负优化
- `React.memo` 只对"父组件频繁重渲染但子组件 props 稳定"的场景有价值
