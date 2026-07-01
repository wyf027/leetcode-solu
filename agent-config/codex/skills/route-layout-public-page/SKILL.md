---
name: route-layout-public-page
description: 路由/Layout/公开页接入实践 SOP。解决"新增页面要改哪些文件"和"公开页为什么被拦截或布局错误"的排查问题。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# 路由、Layout、公开页 / 免登录页 接入实践

## 这个 skill 解决什么代码问题

解决"新增一个页面时要改哪些文件"和"公开页为什么被拦截或布局错误"的排查问题。
本项目的路由保护和壳层控制分布在多个文件中，改一处忘一处是最高频的问题来源。

## 适用场景

- 新页面接入：需要注册新路由
- 路由调整：修改路径结构、参数传递方式
- 公开页 / 免登录页接入：分享页、详情页、落地页
- 热修："访问时被跳登录""页面多了侧栏""飞书打开白屏"
- AI 改代码：约束 AI 不忘改 middleware / ClientLayout

## 项目中的规范入口

路由和壳层控制涉及的关键职责：

```
路由保护文件          ← 判断是否需要登录（放行列表 / 特判条件）
壳层控制文件          ← 判断是否显示侧栏（隐藏列表）
根 layout             ← 字体、meta、Script
角色 layout           ← B/C 端各自的角色校验
page 入口             ← 页面组件
可选页面级 layout     ← 页面级嵌套
```

核心约束：**路由保护列表**与**壳层隐藏列表**必须对齐，否则会出现"能访问但布局错"或"布局对但被拦截"。

## 推荐组织方式

### 路由分类（抽象模型）

```
需要登录 + 需要壳层：
  → 路由保护默认拦截 → 角色 layout 校验

需要登录 + 无壳层：
  → 路由保护默认拦截 → 壳层隐藏列表添加路径

无需登录 + 无壳层：
  → 路由保护放行列表添加路径 → 壳层隐藏列表添加路径
```

### 动态路由参数选择

```
路径段参数（推荐用于标识资源）：
  /xxx/[id]             → 资源唯一标识

Query 参数（推荐用于筛选/分页/来源标记）：
  ?redirect=/dashboard  → 登录后回跳
  ?page=2&size=20       → 分页
```

## 开发 SOP

**新增受保护页面（需登录）：**

1. 创建 `app/<domain>/xxx/page.tsx`
2. 确认父级角色 layout 已做校验
3. 无需改路由保护文件（默认拦截未登录）
4. 无需改壳层控制文件（默认显示壳层）

**新增公开页面（免登录、无壳层）：**

1. 创建 `app/xxx/page.tsx`
2. 修改路由保护文件 → 在放行列表中添加路径
3. 修改壳层控制文件 → 在隐藏列表中添加路径
4. 测试：未登录状态能访问、页面无壳层

**新增"需登录但无壳层"页面：**

1. 创建 `app/<domain>/xxx/page.tsx`
2. 不改路由保护文件（默认需要登录）
3. 修改壳层控制文件 → 隐藏列表添加路径
4. 测试：未登录跳登录、登录后无壳层

**排查"被跳到登录页"：**

1. 检查路由保护文件 → 该路径是否在放行列表或特判条件中？
2. 检查请求 → cookie 中是否有 token？
3. 检查请求拦截器 → 是否错误注入了失效 token 触发 401？

**排查"壳层不该出现但出现了"：**

1. 检查壳层控制文件 → 隐藏列表是否包含该路径？
2. 注意前缀匹配逻辑，`/xxx` 可能匹配 `/xxx/yyy`

## 当前项目参考实现

> 以下为 antview-frontend 的具体文件和命名，其他项目应参照上方抽象 SOP 选择等价方案。

| 抽象概念 | antview-frontend 对应 |
|----------|----------------------|
| 路由保护文件 | `middleware.ts` |
| 放行列表 | `publicRoutes` 数组 + 特判条件 |
| 壳层控制文件 | `app/ClientLayout.tsx` |
| 隐藏列表 | `hideLayoutPages` 数组 |
| B 端角色 layout | `app/buser/layout.tsx`（`useRoleGuard('hr')`） |
| C 端角色 layout | `app/cuser/layout.tsx` |

**路由分类示例（antview 实际路径）：**

```
需要登录 + 需要壳层：
  /buser/*、/cuser/*

需要登录 + 无壳层：
  /cuser/oAManagement/*

无需登录 + 无壳层：
  /login、/jobDetails/[id]、/shareJobForm/*、/feishu/auth
```

**动态路由参数示例：**

```
路径段：/jobDetails/[id]、/buser/jobsCreate/[jobId]、/cuser/personManagement/[id]
Query：?redirect=/buser/dashboard、?from=feishu&appId=xxx、?page=2&size=20
```

**壳层前缀匹配注意**：`pathname?.startsWith(page)` 所以 `/xxx` 会匹配 `/xxx/yyy`。

## 常见反模式

### 反模式 1：只改路由保护不改壳层控制
结果：页面不拦截了，但出现了壳层，布局错误。

### 反模式 2：只改壳层控制不改路由保护
结果：壳层确实没了，但未登录用户被重定向到登录页。

### 反模式 3：用模糊前缀放行路由
```ts
// 错误 — 模糊前缀可能误放行其他需要鉴权的子路径
if (pathname.startsWith('/feishu')) return NextResponse.next();
```
**正确做法**：精确匹配具体公开路径。

### 反模式 4：在路由保护文件中写复杂业务判断
middleware 是 Edge Runtime，不应有重逻辑；复杂跳转判断放在 page 内部或 hook 中。

### 反模式 5：公开页组件依赖 store 不做兜底
```tsx
// 错误 — 公开页用户可能未登录，store 为空
const { companyInfo } = useBUserStore();
return <div>{companyInfo.name}</div>; // companyInfo 可能 undefined
```

## 热修时优先改哪层

1. **首选：路由保护文件**（添加/修正放行条件）— 只影响路由保护
2. **次选：壳层控制文件**（修正隐藏列表）— 只影响壳层
3. **慎改：page 内部重定向逻辑** — 可能影响登录回跳流程
4. **尽量不动：角色 layout** — 影响整个 domain 下的所有页面

## 回归检查项

- [ ] 路由保护放行与壳层隐藏列表已对齐
- [ ] 路径匹配精确，无误放行
- [ ] 公开页组件对未登录态做了兜底
- [ ] 动态参数使用路径段（资源标识）或 query（筛选/来源）
- [ ] B/C 端页面经过各自角色 layout 校验
- [ ] 登录回跳 redirect 参数正确保留

## 不适用场景

- API 路由（`app/api/`），不涉及前端页面布局和 middleware 放行
- 纯组件开发（不新增路由），不需要改 middleware / ClientLayout
- 已有页面内的局部 UI 调整

## 输出要求

- 新增页面时，列出需要修改的文件清单（page / 路由保护文件 / 壳层控制文件 / 角色 layout）
- 说明该页面属于哪类路由（需登录+侧栏 / 需登录+无侧栏 / 免登录+无侧栏）

## 信息不足时先确认

- 该页面是否需要登录？
- 是否需要显示侧栏？
- 该页面属于 B 端还是 C 端还是公共？

## 适合给 Cursor 的提示模板

```
本项目路由规范：
- 新增公开页必须同时修改：路由保护文件（放行）+ 壳层控制文件（隐藏列表）
  （antview 中为 middleware.ts + app/ClientLayout.tsx 的 hideLayoutPages）
- 路径匹配必须精确，使用 startsWith('/xxx/') 或完全匹配
- 是否需要登录 = 路由保护文件控制；是否显示壳层 = 壳层控制文件控制
- B/C 端页面放在各自 domain layout 下，自动经过角色校验
- 公开页组件必须对 store 为空 / cookie 无 token 的情况做兜底
- 资源标识用路径段参数 [id]，筛选/来源用 query string
```
