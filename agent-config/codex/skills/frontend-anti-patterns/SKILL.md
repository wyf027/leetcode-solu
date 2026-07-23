---
name: frontend-anti-patterns
description: 前端工程反模式识别与检测手册。包含 11 条高频反模式，每条给出：为什么是问题、正确做法、可执行的检测命令（rg / IDE 搜索 / 手动判断）。在 cleanup 开始前或 code review 时加载，用于扫描是否存在这些问题。
license: MIT
metadata:
  author: zhangxia
  version: "1.3.1"
  suite: frontend-governance
---

> **frontend-governance v1.3.1（稳定版）** · 已冻结，进入实战验证阶段，禁止在执行任务时直接修改 skill / rule。

# 前端工程反模式识别手册

**加载时机：** cleanup 开始前扫描问题、code review、或怀疑代码存在某类问题时加载。  
**职责：** 提供 11 条可检测的反模式，帮助在修改前发现问题，决定是否处理以及分配到哪一轮。

---

## 检测工具优先级（适用于本文所有检测命令）

每条反模式的检测按以下顺序执行：

1. **首选：`rg`（ripgrep）**——速度最快，支持 `--type ts/tsx`，优先使用
2. **次选：IDE 全局搜索**——Cursor / VSCode 的 Ctrl+Shift+F，输入相同关键字，效果等价
3. **再次：代码结构扫描**——阅读目标文件的 import、export、useState、useEffect 块
4. **兜底：手动判断**——基于已读代码和反模式描述，主观判断是否存在

**规则：不允许因工具不可用而跳过检测。无 `rg` 时用 IDE 搜索替代，并在输出中说明使用了哪种方式。**

---

## 反模式索引

| # | 反模式 | 归属轮次 | 风险 |
|---|---|---|---|
| 1 | 组件内写 mapper / normalize | 第二轮 | 中 |
| 2 | 页面层手写 payload | 第二轮 | 中 |
| 3 | 双 toast（hook + page 各一次） | 第三轮 | 中 |
| 4 | 多处维护同一个 loading | 第三轮 | 高 |
| 5 | Chained useEffect（状态驱动副作用链） | 第三轮 | 中 |
| 6 | setState 在组件卸载后执行 | 第五轮 | 高 |
| 7 | Long ID 转 number | 第二轮 | 极高 |
| 8 | UploadFile 原始对象进入业务态 | 第四轮 | 高 |
| 9 | Select value 类型不一致 | 第二轮 | 高 |
| 10 | 未实现功能可点击但无反馈 | 第四轮 | 中 |
| 11 | 同一逻辑在多个组件重复实现 | 第一轮 | 低 |

---

## 反模式详情

---

### 1. 组件内写 mapper / normalize

**问题：** 组件是渲染单元，不是数据处理器。组件内的 mapper 逻辑无法复用，测试困难，随业务迭代越来越乱。

**正确做法：** 所有字段转换放在 normalize 层或 mapper 层，组件只消费稳定结构。

**检测方式：**
```bash
# 在 .tsx 文件中搜字段拼接逻辑
rg "\?\?.*name|\?\?.*email|\|\|.*候选人" --type tsx

# 搜组件内的临时字段转换变量
rg "const display|const xxxLabel|const mapped" --type tsx

# 搜接口字段直接出现在 JSX 中
rg "data\.\w+(Id|Code|Type)\b" --type tsx
```
**判断标准：** 若在组件文件中发现字段转换逻辑（非简单 `?? '-'` 兜底），则存在此反模式。

---

### 2. 页面层手写 payload

**问题：** payload 散落在多处（page + hook + component），修改接口字段时需要改多个地方，极易遗漏，类型容易不一致。

**正确做法：** 建立 `buildXxxParams()` 唯一 payload 出口，所有提交都通过它。

**检测方式：**
```bash
# 在 page.tsx 中搜含接口字段的对象字面量
rg "\{ userId:|\{ jobId:|\{ flowType:|\{ startTime:" --glob "*page.tsx"

# 搜不在 buildXxx 函数中的 payload 构造
rg "flowType:|roundNo:|candidateId:" --type ts | grep -v "buildXxx\|params\|Params"
```
**判断标准：** 若 page 文件或组件文件中存在接口字段名的对象构造，则存在此反模式。

---

### 3. 双 toast（hook + page 各 toast 一次）

**问题：** 用户看到两条相同（或相似）的错误提示，体验差，且 toast 出现时机不可预期。

**正确做法：** 谁调用接口谁处理 toast；页面层的 catch 只做无 toast 的收尾（如跳转）。

**检测方式：**
```bash
# 找所有 toast 调用点，再手动检查调用链
rg "message\.(error|success|warning)" --type ts -n
```
**判断标准：** 同一请求的错误处理链上，`message.error` 出现两次及以上，则存在此反模式。

---

### 4. 多处维护同一个 loading

**问题：** 同一请求的 loading 状态在 hook 和 page 各维护一份，两处不同步，会出现 loading 显示消失不一致、多个组件联动 loading 的 bug（如安排面试时所有卡片都转圈）。

**正确做法：** loading 单一来源，hook 维护，组件消费，通过 ID 或 key 精确定位到触发源。

**检测方式：**
```bash
# 找所有 boolean loading state 声明
rg "useState\(false\)|useState<boolean>" --type ts -n

# 找传递给多个同级组件的全局 loading boolean
rg "continueLoading|submitLoading|actionLoading" --type tsx
```
**判断标准：** 若一个 loading boolean 被广播给列表中所有卡片（而非按 ID 精确匹配），则存在此反模式。

---

### 5. Chained useEffect（状态驱动副作用链）

**问题：** Effect A 设置 stateX → Effect B 监听 stateX 执行副作用 B → 中间多一次无意义的渲染，调试困难，时序不可控，且 stateX 的其他触发路径也会意外触发 Effect B。

**正确做法：** 在第一个副作用的 `.then()` 里直接执行后续操作，消除中间 state。

**检测方式：**
```bash
# 找所有 useEffect，检查 deps 中是否有 state 变量
rg "useEffect\(" --type ts -A 5
```
**手动检查：** Effect A 中只有 `setXxx(...)`，Effect B 的 deps 里有 `xxx`（Effect A 设置的 state）。  
**判断标准：** 若存在"Effect A 只做 setState → Effect B deps 包含该 state"的模式，则存在此反模式。

---

### 6. setState 在组件卸载后执行

**问题：** 用户关闭弹窗后，异步请求仍在飞，resolve 后对已卸载的组件执行 setState，导致 React 警告、潜在内存泄漏和状态污染。

**正确做法：** 在 useEffect 返回的 cleanup 中设置 `ignore = true`，或使用 `AbortController` 取消请求。

**检测方式：**
```bash
# 找含异步操作的 useEffect，检查是否有 cleanup return
rg "useEffect\(" --type ts -A 15 | grep -A 15 "fetch\|axios\|await\|\.then("
```
**判断标准：** 若 useEffect 内有异步操作（fetch/axios/await），且无 `return () => { ignore = true }` 或 AbortController，则存在此反模式。

---

### 7. Long ID 转 number

**问题：** JavaScript `number` 精度上限为 `2^53 - 1`（约 9007 亿），Java Long / 雪花 ID 普遍超过此范围。一旦转为 number，低位精度丢失，请求参数出错，表现为"随机性 bug"，极难排查。

**正确做法：** 所有 Long ID 全程 string，包括 Select value、表单字段、payload、列表 key。

**检测方式：**
```bash
# 找对 ID 字段的 number 转换
rg "Number\(.*[Ii]d\)|parseInt\(.*[Ii]d\)|\+\s*\w*[Ii]d" --type ts

# 找 Select option value 是否为 number 类型
rg "value:\s*[0-9]" --type ts | grep -i "option\|select"

# 找列表 key 是否直接用 number 字段
rg "key=\{[^\"']" --type tsx
```
**判断标准：** 任何对以 `Id`/`id` 结尾字段的 Number/parseInt/+ 操作，均存在此反模式。

---

### 8. UploadFile 原始对象进入业务态

**问题：** antd Upload 组件的 `UploadFile` 对象包含内部状态（`status`、`xhr` 等），直接存入业务 state 会导致序列化失败、接口参数污染、回显时数据格式不匹配。

**正确做法：** 上传完成后只取 `response.url` 或 `originFileObj`；展示时只用 URL 字段。

**检测方式：**
```bash
# 找 UploadFile 类型出现在业务 state 或接口参数中
rg "UploadFile" --type ts

# 找 fileList 直接进入 useState 或 form 值
rg "setFileList|fileList.*useState|form.*fileList" --type ts

# 找提交逻辑中是否直接取 fileList 而非 fileList.map(f => f.url)
rg "fileList" --type ts | grep -i "submit\|params\|payload\|buildXxx"
```
**判断标准：** 若 `UploadFile[]` 类型出现在业务 state 的泛型参数或接口 payload 类型中，则存在此反模式。

---

### 9. Select value 类型不一致

**问题：** option.value 是 `number`，但 form 存的是 `string`（或反过来），导致受控组件无法正确匹配选中态，提交时类型不符合接口预期。

**正确做法：** `option.value`、`form.getFieldValue`、`payload` 的类型三者必须完全一致，统一为 string 或统一为 number。

**检测方式：**
```bash
# 找 option value 类型定义
rg "value:\s*(string|number)" --type ts | grep -i "option\|select"

# 找 getFieldValue / getFieldsValue 使用，对比 payload 同字段类型
rg "getFieldValue|getFieldsValue" --type ts -A 2

# 找 Select onChange 参数类型与 option.value 类型是否匹配
rg "onChange.*value.*string|onChange.*value.*number" --type tsx
```
**判断标准：** 同一个 Select 的 option.value 类型、form 存储类型、payload 字段类型三者不一致，则存在此反模式。

---

### 10. 未实现功能可点击但无反馈

**问题：** "点了没反应"是最差的 UX。用户不知道是 bug 还是功能未开放，只会反复点击并产生困惑。

**正确做法：** 未实现功能要么不渲染（隐藏），要么渲染为 disabled 状态并通过 Tooltip 说明原因。noop 函数必须有注释。

**检测方式：**
```bash
# 找空 onClick handler
rg "onClick=\{.*\(\)\s*=>\s*\{\s*\}\}" --type tsx
rg "onClick=\{.*=>\s*\{\s*\}\}" --type tsx

# 找 _onXxx 前缀的 prop
rg "_on[A-Z]\w+:" --type tsx

# 找没有注释的 noop
rg "\(\)\s*=>\s*\{\}" --type ts | grep -v "//"
```
**判断标准：** 若存在空 onClick，且对应 UI 是可见可点击的按钮/链接，则存在此反模式。

---

### 11. 同一逻辑在多个组件重复实现

**问题：** 相同的 empty state 文案、相同的错误提示、相同的 loading 展示各写一套，维护时需要改多处，且行为容易出现细微差异，用户体验不一致。

**正确做法：** 提取为公共 Hook、公共组件、公共常量；相同逻辑只有一处实现。

**检测方式：**
```bash
# 找相同的文案字符串在多个文件出现
rg "暂无数据|未知候选人|加载失败|请稍后重试" --type tsx -l

# 找相同的错误处理模式
rg "message\.error\('.*'\)" --type ts | sort | uniq -d

# 找相似的 loading/empty 结构在多处实现
rg "<Spin\s|Empty\s|暂无" --type tsx -l
```
**判断标准：** 相同文案字符串出现在 3 个以上文件，或相同错误处理逻辑在 2 个以上 hook 中独立实现，则存在此反模式。
