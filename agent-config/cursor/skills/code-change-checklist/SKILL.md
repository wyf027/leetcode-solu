---
name: code-change-checklist
description: 代码修改通用检查清单实践 SOP。解决"改了一处忘改另一处"、"热修改出新 bug"、"AI 改代码不符合规范"等修改边界问题。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 代码修改通用检查清单实践

## 这个 skill 解决什么代码问题

解决"改了一个地方忘了改另一个地方""热修改出新 bug""AI 改的代码不符合项目规范"等修改边界问题。
这是一个"元 skill"——每次改代码前都应该过一遍。

## 适用场景

- 任何代码修改前后的自检
- 热修 / 线上问题修复
- AI 辅助编码后的人工审查
- 代码评审时的检查依据
- 新人提交代码前的自检

## 项目中的规范入口

本检查清单覆盖的项目层级：

```
types/           ← 类型定义层
hooks/           ← 业务逻辑层（含 mappers）
components/      ← 组件渲染层
services/        ← 请求封装层
constants/       ← 常量定义层
middleware.ts    ← 路由保护层
app/             ← 页面编排层 + 路由注册
```

## 开发 SOP：改代码前的通用步骤

### 第一步：明确影响范围

改动前回答以下问题：
1. 这次改动影响哪些文件？（列出来）
2. 这些文件分别属于哪一层？
3. 改动会影响其他消费方吗？
4. 改动是否可回滚？

### 第二步：按场景选择检查清单

根据改动类型选择对应的检查项（见下方各场景）。

### 第三步：改动后验证

1. TypeScript 编译通过
2. Prettier / ESLint 格式化通过
3. 手动验证受影响的功能路径
4. 确认 diff 范围与预期一致（无意外改动）

## 场景一：新增 / 修改字段

**改动前确认：**
- 这个字段从哪来？（后端接口 / 前端计算 / 用户输入）
- 这个字段流向哪？（展示 / 表单回填 / 提交 payload）
- 这个字段是 ID 吗？（是 → 全程 string）

**检查清单：**
- [ ] `types/` 中 DTO / FormData 类型已更新
- [ ] `hooks/<domain>/mappers.ts` 中 mapper 已适配
- [ ] `hooks/<domain>/mappers.ts` 中 payload builder 已包含
- [ ] 表单回填函数（`mapDetailToXxx`）已覆盖
- [ ] 组件 UI 已展示或采集
- [ ] nullable 字段有兜底值
- [ ] ID 字段保持 string 全链路
- [ ] Select option.value 与 form value 类型一致

## 场景二：修改请求 / 接口

**改动前确认：**
- 是新增接口还是修改已有接口？
- 是否影响了请求参数或返回结构？
- 是否是匿名接口？

**检查清单：**
- [ ] `services/<domain>/` 中 service 函数已更新
- [ ] service 函数返回类型已同步
- [ ] 错误处理只在 hook 层 toast
- [ ] 匿名接口已配置 skipAuth / 白名单
- [ ] SWR / React Query 的缓存 key 是否需要更新
- [ ] hook 中使用了 `checkResCode` 处理业务错误

## 场景三：新增 / 修改公开页

**改动前确认：**
- 这个页面需要登录吗？
- 需要显示侧栏吗？
- 有动态路由参数吗？

**检查清单：**
- [ ] `middleware.ts` 放行列表已更新
- [ ] `app/ClientLayout.tsx` 的 `hideLayoutPages` 已更新
- [ ] 两处路径配置对齐
- [ ] 组件对未登录态（store 为空 / cookie 无 token）做了兜底
- [ ] 路径匹配精确，未误放行其他路径

## 场景四：修改样式

**改动前确认：**
- 这个样式改动是否有对应的样式常量？
- 是局部修改还是全局影响？

**检查清单：**
- [ ] 使用了已有样式常量（而非重新写一套）
- [ ] antd 覆盖优先用 `[&_.ant-xxx]` 局部覆盖或复用已有 ConfigProvider theme，不新增独立 CSS 文件
- [ ] 颜色使用 designTokens / 主题变量
- [ ] 响应式优先复用项目已有断点，不自创新断点
- [ ] 对齐用 flex/grid 而非负偏移
- [ ] 长 className 已抽为常量

## 场景五：热修 / 线上问题修复

**最小改动原则：**

```
优先级从高到低：
1. 改 constants / mapper（纯函数/常量，风险最低）
2. 改 hook 层逻辑（局部影响，不动组件接口）
3. 改组件渲染（影响面稍大，但通常可控）
4. 改 page 编排（可能影响多个子组件）
5. 改 middleware / ClientLayout（全局影响，最高风险）
```

**检查清单：**
- [ ] 已确认根因（不是猜测修复）
- [ ] 改动范围 ≤ 3 文件、≤ 20 行
- [ ] 不包含无关重构
- [ ] 改动可回滚
- [ ] 改动后手动验证了受影响的功能路径
- [ ] 没有引入新的 lint / TypeScript 错误

## 场景六：AI 改代码后的人工审查

**必须检查的 AI 常见问题：**

- [ ] **分层**：AI 是否在 page 中写了业务逻辑？（应在 hook 层）
- [ ] **数据流**：AI 是否在组件中直接消费 raw response？（应经 mapper）
- [ ] **ID 处理**：AI 是否使用了 `Number(id)`？（应全程 string）
- [ ] **类型**：AI 生成的类型是否与已有定义一致？（不要重复定义）
- [ ] **import**：AI 的 import 分组是否符合项目约定？（三方 → type → 业务 → 相对路径）
- [ ] **依赖**：AI 是否引入了项目不存在的包？
- [ ] **样式**：AI 是否新增了独立 CSS 文件覆盖 antd？（优先用 `[&_]` 或复用已有覆盖方式）
- [ ] **格式**：AI 生成的代码是否经过 Prettier / ESLint？
- [ ] **冗余**：AI 是否生成了多余的 `console.log` / 注释？
- [ ] **命名**：AI 生成的文件名和变量名是否符合项目习惯？

## 常见反模式

### 反模式 1：改了 UI 忘了改 mapper
新增了一个字段的展示，但 mapper 中没有从 raw response 映射到 ViewModel → 展示空白。

### 反模式 2：改了 mapper 忘了改 payload
mapper 中添加了新字段映射，但 payload builder 中遗漏 → 提交时字段丢失。

### 反模式 3：热修时顺手重构
修一个 bug 的同时重构了无关代码 → diff 过大，review 困难，回滚困难。

### 反模式 4：AI 改代码后不检查
直接接受 AI 输出 → 分层违规、类型不匹配、样式不一致、import 乱序。

### 反模式 5：改公开页只改一处
只改了 middleware 没改 ClientLayout → 页面不拦截了但出现了侧栏。

## 热修时优先改哪层

```
风险从低到高：
constants/ < mappers.ts < hooks/ < components/ < page < middleware/ClientLayout
   ↑                                                           ↑
 最安全                                                     最高风险
```

原则：
- **先修数据层**（mapper / constants）：纯函数，影响面可预测
- **再修逻辑层**（hook）：局部影响
- **最后修视图层**（component / page）：影响面最大
- **非必要不改全局层**（middleware / ClientLayout / axiosConfig）

## 回归检查项

- [ ] 改动前声明了影响文件列表
- [ ] 四层一致性满足（types / mapper / UI / payload）
- [ ] 无顺手改的无关代码
- [ ] TypeScript 编译通过
- [ ] Prettier / ESLint 通过
- [ ] 手动验证了受影响的功能路径
- [ ] diff 范围与预期一致

## 不适用场景

- 纯文档修改（README / 注释），不涉及功能代码
- 依赖升级（package.json 版本更新），有独立的升级流程
- 纯配置变更（ESLint / Prettier 规则调整），不影响业务代码

## 输出要求

- 改动前列出影响文件及所属层级
- 改动后给出对应场景的检查清单执行结果

## 信息不足时先确认

- 本次改动属于哪个场景？（字段 / 接口 / 公开页 / 样式 / 热修 / AI 改代码）
- 影响范围是否已确认？涉及几个文件？

## 适合给 Cursor 的提示模板

```
修改代码前请先确认：
1. 列出本次修改影响的所有文件
2. 确认修改范围（types / mapper / hook / component / service / middleware）
3. 遵循最小改动原则：
   - 热修 ≤ 3 文件
   - 不做无关重构
   - 优先改 mapper/hook，慎改 page/middleware
4. 修改后检查：
   - 新增字段：types / mapper / UI / payload 四层同步
   - ID 字段：全程 string
   - 公开页：middleware + ClientLayout 对齐
   - 样式：用已有常量，不写新 CSS 文件
5. 最后运行 Prettier + ESLint，确认 0 报错
```
