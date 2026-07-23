---
name: service-request-auth
description: Service 层请求配置与鉴权实践 SOP。解决"新增接口该怎么落 service"、"匿名接口 401"、"重复弹窗"等请求层问题。
license: MIT
metadata:
  author: antview-frontend
  version: "1.0.0"
---

# Service 层、请求配置、鉴权注入实践

## 这个 skill 解决什么代码问题

解决"新增接口该怎么落 service""匿名接口为什么带了过期 token""用户看到两次错误提示"等请求层代码问题。

## 适用场景

- 新功能开发：需要接入新 API
- 字段新增：修改已有接口参数或返回值
- 热修：接口报错、401 风暴、重复弹窗
- AI 改代码：约束 AI 不在组件中直接调 axios

## 项目中的规范入口

```
services/axiosConfig.ts            ← axios 单例 + 拦截器（全局唯一）
services/<domain>/index.ts         ← 按领域组织的 API 函数
constants/mappers.ts               ← checkResCode / BusinessError
lib/appMessage.ts                  ← 全局 message 实例
hooks/<domain>/useXxxPage.ts       ← 消费 service 的 hook
```

关键机制说明：

**鉴权注入**：请求拦截器中，`shouldAttachAuth(config)` 判断是否注入 `Authorization` header。满足以下任一条件时不注入：
- 调用方传了 `skipAuth: true`
- 请求 URL 命中 `PUBLIC_AUTH_PATHS` 白名单

**401 处理**：响应拦截器中，401/402/403 状态码触发清除 cookie + 重定向登录页。同批次多请求只弹一次 toast（`authErrorTipShown` 防重复）。

**业务错误处理**：`checkResCode(res)` 在 `code !== 200` 时弹 toast 并抛 `BusinessError`（`isBusinessError: true`），调用方的 catch 可用此标记避免重复 toast。

## 推荐组织方式

### service 文件结构

```
services/
├── axiosConfig.ts          ← 全局唯一，不要创建第二个实例
├── buser/
│   └── jobsCreate.ts       ← 每个领域一个文件
├── cuser/
│   ├── resume/index.ts     ← 复杂领域可用目录
│   ├── jobManagement.ts
│   └── profile.ts
├── login/
│   ├── index.ts
│   └── securityService.ts
└── common/
    ├── region.ts           ← 跨领域通用接口
    └── upload.ts
```

### 调用链路

```
page → hook → service 函数 → axiosInstance → 拦截器
                                              ↓
                                    自动注入 token（或 skip）
                                    自动处理 401 重定向
                                              ↓
                                    response.data（拦截器已拆壳）
```

### 错误处理分层（推荐流程）

```
service 层：只封装请求，不做 UI 反馈

hook 层（推荐写法）：
  const res = await xxxService(params);
  checkResCode(res);           ← 业务错误：弹 toast + 抛 BusinessError
  // 正常逻辑...
  } catch (err) {
    if (!isBusinessError(err)) { ← 已由 checkResCode toast 的不再重复
      message.error('网络异常');  ← 只对网络/未预期异常 toast
    }
    // 其他收尾...
  }

  // 类型守卫（建议在 utils 中统一定义，避免 as any）
  function isBusinessError(
    err: unknown,
  ): err is Error & { isBusinessError: true } {
    return (
      err instanceof Error &&
      'isBusinessError' in err &&
      err.isBusinessError === true
    );
  }

page 层：catch 中只做收尾（跳转、清状态），不弹 toast
```

## 开发 SOP

**新增 API 接口：**

1. 确定接口属于哪个领域 → 找到或创建 `services/<domain>/xxx.ts`
2. 编写 service 函数，标注泛型返回类型
3. 在 hook 中调用 service 函数
4. 使用 `checkResCode(res)` 处理业务错误
5. 如果是匿名接口 → 传 `{ skipAuth: true }` 或更新 `PUBLIC_AUTH_PATHS`

**新增匿名接口：**

1. 判断方式一：在 `axiosConfig.ts` 的 `PUBLIC_AUTH_PATHS` 中添加路径
2. 判断方式二：在调用时传 `{ skipAuth: true }`
3. 验证：cookie 中有旧 token 时，该接口的 request header 不应包含 Authorization

**排查 401 风暴：**

1. 检查 `axiosConfig.ts` → 该接口是否应该在 `PUBLIC_AUTH_PATHS` 中？
2. 检查 cookie → token 是否过期或为空字符串？
3. 检查是否有多个请求并发触发了多次重定向 → `redirectState.isRedirecting` 防护是否生效？
4. 检查飞书环境 → `isFeishuEnv()` 判断是否正确，重定向目标是否正确？

## 常见反模式

### 反模式 1：hook 中直接用 axios
```ts
// 错误
import axiosInstance from '@/services/axiosConfig';
const data = await axiosInstance.get('/hire/xxx');
```
**正确做法**：在 service 文件中封装函数，hook 调用 service 函数。

### 反模式 2：service 中弹 toast
```ts
// 错误 — service 不应有 UI 操作
export async function getJob(id: string) {
  try {
    return await axiosInstance.get(`/hire/job/${id}`);
  } catch {
    message.error('获取失败'); // 不应该在这里
  }
}
```

### 反模式 3：hook catch 中无差别 toast（双重 toast）
```ts
// hook — 错误写法
async function handleSave() {
  try {
    const res = await saveJob(data);
    checkResCode(res); // checkResCode 内部已弹 toast
    message.success('保存成功');
  } catch (err) {
    message.error('保存失败'); // ← 又弹一次！checkResCode 已弹过
    throw err;
  }
}
```
**正确做法**：catch 中用类型守卫判断，只对非业务异常弹 toast：
```ts
} catch (err) {
  if (!isBusinessError(err)) {
    message.error('网络异常，请重试');
  }
  throw err;
}

// 类型守卫（建议在 utils 中统一定义）
function isBusinessError(
  err: unknown,
): err is Error & { isBusinessError: true } {
  return (
    err instanceof Error &&
    'isBusinessError' in err &&
    err.isBusinessError === true
  );
}
```

### 反模式 4：新增匿名接口不更新白名单
```ts
// service 中新增了一个公共接口但没配置 skipAuth
export const getPublicJobDetail = (id: string) =>
  axiosInstance.get(`/hire/job/public/${id}`);
// 如果 cookie 中有旧 token，会被注入 → 旧 token 过期 → 401
```

## 热修时优先改哪层

1. **首选：hook 层错误处理**（toast 逻辑修正）— 只影响单个功能
2. **次选：service 层返回类型**（类型标注修正）— 不影响运行时
3. **慎改：axiosConfig 拦截器**（鉴权/重定向逻辑）— 影响全局所有请求
4. **尽量不动：PUBLIC_AUTH_PATHS 白名单**（除非确认是白名单遗漏导致的 401）

## 回归检查项

- [ ] 新接口在 service 文件中有对应函数
- [ ] service 函数有泛型返回类型标注
- [ ] 匿名接口配置了 skipAuth 或在白名单中
- [ ] hook 层使用 checkResCode 处理业务错误
- [ ] 错误 toast 只出现一次
- [ ] service 函数中无 UI 操作

## 不适用场景

- 纯前端计算（不涉及 API 调用）
- 第三方 SDK 回调处理（如支付回调），不走 axiosInstance

## 输出要求

- 新增接口时，给出 service 函数签名 + hook 层调用代码（含错误处理）
- 涉及匿名接口时，说明选择 `skipAuth` 还是白名单及理由

## 信息不足时先确认

- 该接口是否需要鉴权？（决定是否 skipAuth）
- 当前 hook 中已有的错误处理模式是什么？（避免引入不一致写法）
- 是否有并发请求场景？（决定是否需要关注 401 防重复弹窗）

## 适合给 Cursor 的提示模板

```
本项目请求层规范：
- API 调用必须封装在 services/<domain>/ 中，hook 调 service，page 不直接调 axios
- 匿名接口必须配置 skipAuth: true 或在 PUBLIC_AUTH_PATHS 中注册
- 业务错误用 checkResCode(res) 统一处理，checkResCode 内部弹 toast 并抛 BusinessError
- hook catch 中判断 isBusinessError 跳过已 toast 的，只对网络/未预期异常弹 toast
- page 的 catch 只做收尾（跳转、清状态），不弹 toast
- service 函数不做 UI 操作（不弹 toast、不弹 modal）
- service 函数必须标注泛型返回类型
```
