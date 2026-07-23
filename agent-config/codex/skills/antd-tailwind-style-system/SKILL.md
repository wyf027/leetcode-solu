---
name: antd-tailwind-style-system
description: antd + Tailwind CSS 混合样式实践 SOP。解决"antd 该用 Tailwind 还是 CSS 覆盖"、"类名太长怎么管理"等样式问题。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# antd + Tailwind CSS 混合样式实践

## 这个 skill 解决什么代码问题

解决"antd 组件该用 Tailwind 还是 CSS 覆盖""为什么 antd 样式不生效""类名太长怎么管理"等样式代码问题。

## 适用场景

- UI 还原：按设计稿调整组件样式
- 样式调整：修改颜色、间距、圆角、字号
- 新组件开发：选择样式方案
- 热修：样式错位、antd 组件样式不对
- AI 改代码：约束 AI 不随意写 CSS 文件覆盖 antd

## 项目中的规范入口

```
constants/designTokens.ts                    ← 设计令牌（颜色/字号/间距）
constants/classGlobal.ts                     ← 全局页面级样式常量
constants/jobCreate/jobCreateControlStyles.ts ← 表单控件样式常量
constants/jobCreate/jobCreateFormStyles.ts    ← 表单标签/按钮样式常量
constants/buttonClass/                       ← 按钮类名常量
app/globals.css                              ← CSS 变量（:root）
```

本项目样式方案核心原则：
- **antd 提供组件结构**，Tailwind 提供 utility 微调
- **覆盖 antd 内部样式**优先使用 Tailwind 的 `[&_.ant-xxx]` 选择器写法（当前项目主要范式）；如 antd ConfigProvider `theme` 已覆盖则复用
- **高频复用的类名组合**抽为 `constants/` 下的字符串常量

## 推荐组织方式

### antd 与 Tailwind 的分工

| antd 负责 | Tailwind 负责 |
|-----------|--------------|
| 组件结构（Button/Form/Modal/Table） | 间距、布局（flex/grid/margin/padding） |
| 交互行为（Dropdown/Select/DatePicker） | 颜色微调（text-[#xxx]/bg-[#xxx]） |
| 表单校验和回填 | 尺寸微调（h-[48px]/rounded-[16px]） |
| 主题色（ConfigProvider） | 响应式（如 `min-[1500px]:xxx`，复用项目已有断点） |

### antd 内部样式覆盖方式

**标准写法**：使用 `[&_selector]` 前缀

```tsx
// 覆盖 Form.Item 的 label 样式
<Form.Item
  className={[
    'mb-0',
    '[&_.ant-form-item-label>label]:text-base',
    '[&_.ant-form-item-label>label]:font-medium',
    '[&_.ant-form-item-label>label]:text-[#1c1e21]',
  ].join(' ')}
>
```

**抽为常量**：当多处复用时

```ts
// constants/jobCreate/jobCreateControlStyles.ts
export const JC_FORM_ITEM =
  'mb-0 ' +
  '[&_.ant-form-item-label>label]:text-base ' +
  '[&_.ant-form-item-label>label]:font-medium ' +
  '[&_.ant-form-item-label>label]:text-[#1c1e21]';
```

### 长类名组织方式

```ts
// 推荐：数组 + join
export const MY_BUTTON = [
  'h-9 min-[1500px]:h-10',
  'rounded-full border-0 bg-primary-aux px-4',
  'text-sm font-normal text-white',
  'hover:bg-[#0052CC] active:bg-[#213898]',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

// 推荐：字符串拼接（每段一行）
export const MY_INPUT =
  'w-full h-[48px] rounded-[1rem] ' +
  'border border-solid border-[#9aa6b2] bg-white px-[1rem] ' +
  'text-sm text-[#0f1419]';
```

### 颜色使用优先级

```
1. Tailwind 主题变量：text-important / bg-primary-aux / text-hint
2. designTokens 中定义的值：designTokens.colors.primary
3. CSS 变量：var(--color-primary)
4. 硬编码 hex（最后手段）：text-[#0066FF]
```

## 开发 SOP

**还原设计稿时：**

1. 确认使用哪个 antd 组件 → 先查 antd 文档是否有对应 prop 可配
2. 查 `constants/` 中是否有现成样式常量 → 有则直接用
3. 查 `designTokens.ts` 中的色值和间距 → 匹配设计稿 token
4. 用 Tailwind utility 补充微调 → 间距、圆角、尺寸
5. 需覆盖 antd 内部样式 → 使用 `[&_.ant-xxx]` 写法
6. 类名超过 3 行 → 抽为常量

**修改已有样式时：**

1. 先搜索是否有对应常量 → `rg 'BUTTON_CLASS\|INPUT_CTRL\|FORM_ITEM' constants/`
2. 如果有常量 → 改常量（影响所有消费方，确认影响面）
3. 如果无常量 → 在组件中改，超过 3 行则新建常量

## 常见反模式

### 反模式 1：新增 CSS 文件全局覆盖 antd
```scss
// 错误 — 影响范围不可控
.ant-modal-content {
  border-radius: 24px !important;
}
```
**正确做法**（优先级：antd API > `[&_]` 局部覆盖 > ConfigProvider theme）：
```tsx
<Modal className="[&_.ant-modal-content]:rounded-[24px]">
```

### 反模式 2：用负 margin 修对齐
```tsx
// 错误
<div className="mt-[-3px]">
```
**正确做法**：排查 flex 对齐方式、line-height、或使用 `items-center`。

### 反模式 3：颜色散落硬编码
```tsx
// 错误 — 多处写死同一色值
<span className="text-[#0066FF]">...</span>
<button className="bg-[#0066FF]">...</button>
```
**正确做法**：使用 `text-primary` / `bg-primary-aux` 等主题变量。

### 反模式 4：内联超长 className 字符串
```tsx
// 错误 — 不可读、不可维护
<Button className="h-9 min-[1500px]:h-10 rounded-full border-0 bg-primary-aux px-5 min-[1500px]:px-6 shadow-none text-sm font-normal text-white hover:bg-[#0052CC] active:bg-[#213898] disabled:cursor-not-allowed disabled:opacity-60">
```
**正确做法**：抽为常量 `JC_BTN_PRIMARY`。

### 反模式 5：用 `!important` 强覆盖
应优先使用更精确的选择器路径，如 `[&.ant-btn]:items-center`。

## 热修时优先改哪层

1. **首选：组件 className**（局部修改，影响面最小）
2. **次选：样式常量**（影响所有使用该常量的组件，需确认）
3. **慎改：designTokens / CSS 变量**（影响全局主题）
4. **尽量不动：antd ConfigProvider 主题配置**（影响所有 antd 组件）

## 回归检查项

- [ ] antd 覆盖使用 `[&_.ant-xxx]` 而非 CSS 文件
- [ ] 超过 3 行的 className 已抽为常量
- [ ] 颜色使用 designTokens / 主题变量
- [ ] 对齐用 flex/grid 而非负偏移
- [ ] 条件类名用 clsx / tailwind-merge
- [ ] 响应式复用项目已有断点（如 `min-[1500px]:`）而非自创

## 不适用场景

- 纯逻辑文件（hooks / services / types），不涉及样式
- 已有独立 CSS 文件的历史模块，不要求立即迁移，但新增样式应使用 Tailwind 范式
- 第三方组件库（非 antd）的样式覆盖，需根据具体库决定方案

## 输出要求

- 给出完整的 className（常量定义 + 组件使用），不只写"改一下样式"
- 如果新增覆盖写法，说明是 `[&_]` 还是 ConfigProvider theme 及原因

## 信息不足时先确认

- 设计稿对应的色值是否在 designTokens 中已定义？
- 当前组件是否已有样式常量？常量名是什么？
- 该样式修改影响几处消费方？

## 适合给 Cursor 的提示模板

```
本项目样式规范：
- 组件用 antd，样式微调用 Tailwind utility
- 覆盖 antd 内部样式优先用 [&_.ant-xxx] 写法（当前项目主要范式），也可复用 ConfigProvider theme
- 超过 3 行的 className 抽为常量放 constants/ 下
- 颜色优先用 Tailwind 主题变量（text-important/bg-primary-aux）或 designTokens
- 对齐用 flex/grid，不用负 margin
- 响应式断点复用项目已有断点（如 min-[1500px]:），新增前先确认
- 长类名用数组 .join(' ') 或字符串拼接，每段一行
```
