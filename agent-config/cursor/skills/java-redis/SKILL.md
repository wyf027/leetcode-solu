---
name: java-redis
description: >-
  强制 Java 微服务的全部 Redis 操作通过 common-spring RedisUtil 静态 API，禁止直接注入
  StringRedisTemplate / RedisTemplate，所有缓存必须设置 TTL。
  涵盖：RedisUtil API 速查（Value/List/Set/Hash/ZSet）、Key 命名三段式、CacheConst 常量管理、
  强制 TTL、在 Service 层调用、RedisUtil 扩展新增方法流程。
  适用于：Redis 操作、RedisUtil、缓存读写、Key 设计、CacheConst、TTL 设置、
  StringRedisTemplate、RedisTemplate、自定义 redis 模版、缓存工具类、
  RedisUtil 扩展、新增 RedisUtil 方法、RedisUtil 没有该方法。
compatibility: Java 17+, Spring Boot 3+, common-spring（含 RedisUtil）
metadata:
  domain: java-microservice
  layer: cache
---

# Redis 操作规范

---

## 核心约束（不可违反）

**① 禁止注入 `StringRedisTemplate` / `RedisTemplate`**

所有 Redis 操作必须通过 `RedisUtil` 静态 API，禁止任何服务层自行注入模板类：

```java
// ✅ 正确
RedisUtil.set(String.format(CacheConst.USER_INFO, userId), userInfo, Duration.ofMinutes(30));

// ❌ 禁止：自行注入模板
@Resource
private StringRedisTemplate stringRedisTemplate;   // 禁止

// ❌ 禁止：自定义 RedisTemplate Bean
@Bean
public RedisTemplate<String, Object> redisTemplate(...) { ... }  // 禁止
```

**② 所有缓存必须设置 TTL，无例外**

无 TTL 的 Key 永久占用内存，禁止使用无过期时间的写入重载：

```java
// ✅ 正确
RedisUtil.set(key, value, Duration.ofHours(1));
RedisUtil.setIfAbsent(key, value, Duration.ofSeconds(30));

// ❌ 禁止：任何场景下不得使用无 TTL 重载
RedisUtil.set(key, value);
RedisUtil.setIfAbsent(key, value);
```

**③ 在 Service 层调用，禁止在 Controller / Mapper / Listener 直接调用**

**④ 常量值必须使用 `%s` 占位符，调用处统一使用 `String.format`，禁止字符串拼接**

`CacheConst` 中每个含变量的 Key 必须用 `%s` 标记动态段，调用处通过 `String.format` 生成完整 Key，禁止任何形式的 `+` 拼接：

```java
// ✅ 正确：常量用 %s 占位，调用处 String.format
public static final String FLOW_LOCK = "assess:flow:lock:%s";

String key = String.format(CacheConst.FLOW_LOCK, flowId);
RedisUtil.set(key, "1", Duration.ofSeconds(30));

// ❌ 禁止：常量以 : 结尾再拼接
public static final String FLOW_LOCK = "assess:flow:lock:";   // 禁止

RedisUtil.set(CacheConst.FLOW_LOCK + flowId, "1", Duration.ofSeconds(30));  // 禁止
```

---

## Key 命名规范

采用三段式：`{服务域}:{实体}:{标识}`，全小写，用 `:` 分隔。

| 段 | 说明 | 示例 |
|----|------|------|
| 服务域 | 所属微服务，与包名一致 | `assess` `hire` `system` |
| 实体 | 业务对象 | `flow` `job` `user` |
| 标识 | Key 最后一段，可用变量拼接 | `{flowId}` `{companyId}` |

```java
// Key 示例（%s 为动态变量占位符）
"assess:flow:lock:%s"      // 分布式锁，%s = flowId
"hire:job:config:%s"       // 职位配置缓存，%s = jobId
"system:user:info:%s"      // 用户信息缓存，%s = userId
```

所有 Key **必须**定义在本服务的 `CacheConst`，禁止在 Service 中硬编码字符串，禁止字符串拼接：

```java
// ✅ 正确：常量用 %s 占位，调用处 String.format
RedisUtil.set(String.format(CacheConst.FLOW_LOCK, flowId), "1", Duration.ofSeconds(30));

// ❌ 禁止：硬编码字符串
RedisUtil.set("assess:flow:lock:" + flowId, "1", Duration.ofSeconds(30));

// ❌ 禁止：常量拼接
RedisUtil.set(CacheConst.FLOW_LOCK + flowId, "1", Duration.ofSeconds(30));
```

---

## 新增缓存完整变更清单

**Step 1 — 确认 `RedisUtil` 是否已有所需方法**

先查阅 [RedisUtil_API.md](references/RedisUtil_API.md)。**如果不存在 → 执行 Step 2；已存在 → 跳至 Step 3。**

**Step 2（仅当方法不存在）— 先在 `RedisUtil` 中实现，再引用**

在 `common-spring` 的 `RedisUtil.java` 中补充方法，遵循现有风格：

```java
// 示例：新增 getAndExpire（读取并重置 TTL）
public static <T> T getAndExpire(String key, Duration timeout, Class<T> targetType) {
    Assert.notNull(timeout, "timeout must not be null");
    String value = requireStringRedisTemplate().opsForValue().get(buildKey(key));
    if (value != null) {
        requireStringRedisTemplate().expire(buildKey(key), timeout);
    }
    return deserialize(value, targetType);
}
```

> 新增方法需同步更新 [RedisUtil_API.md](references/RedisUtil_API.md) 的 API 速查表。

**Step 3 — 登记 Key 常量**（`{service}-service/constants/CacheConst.java`）

注释必须说明：**缓存用途** + **完整 Key 格式** + **每段变量的含义** + **TTL**：

```java
/**
 * 评测流程分布式锁。
 * 完整 Key：assess:flow:lock:{flowId}
 *   - flowId：评测流程 ID（AssessmentFlowEntity.id）
 * TTL = 30s
 */
public static final String FLOW_LOCK = "assess:flow:lock:%s";

/**
 * 用户信息缓存。
 * 完整 Key：system:user:info:{userId}
 *   - userId：C 端用户 ID（UserEntity.id）
 * TTL = 30min
 */
public static final String USER_INFO = "system:user:info:%s";

/**
 * 企业下职位配置缓存。
 * 完整 Key：hire:job:config:{companyId}:{jobId}
 *   - companyId：企业 ID（CompanyEntity.id）
 *   - jobId：职位 ID（JobEntity.id）
 * TTL = 1h
 */
public static final String JOB_CONFIG = "hire:job:config:%s:%s";
```

**Step 4 — 在 Service 层使用 `RedisUtil` 读写**

调用前先用 `String.format` 生成完整 Key，禁止在 `RedisUtil` 调用处拼接字符串：

```java
// 写入（带 TTL）
String lockKey = String.format(CacheConst.FLOW_LOCK, flowId);
RedisUtil.set(lockKey, "1", Duration.ofSeconds(30));

// 读取（带类型）
String userKey = String.format(CacheConst.USER_INFO, userId);
UserInfoVO userInfo = RedisUtil.get(userKey, UserInfoVO.class);

// 删除
RedisUtil.delete(String.format(CacheConst.FLOW_LOCK, flowId));

// 存在判断
Boolean locked = RedisUtil.hasKey(String.format(CacheConst.FLOW_LOCK, flowId));
```

**Step 5 — 日志**：写缓存 / 删缓存需打 `log.debug` 日志

```java
String lockKey = String.format(CacheConst.FLOW_LOCK, flowId);
RedisUtil.set(lockKey, "1", Duration.ofSeconds(30));
log.debug("缓存 - 写入 - 成功: key = {}, ttl = 30s", lockKey);
```

---

## API 速查（常用）

**String（Value）**

```java
RedisUtil.set(key, value, Duration.ofMinutes(N));          // 写入（推荐带 TTL 重载）
RedisUtil.get(key, TargetType.class);                      // 读取（带类型反序列化）
RedisUtil.setIfAbsent(key, value, Duration.ofSeconds(N));  // SETNX，常用于分布式锁
RedisUtil.increment(key, delta);                           // 原子自增（计数/限流）
RedisUtil.delete(key);                                     // 删除
RedisUtil.hasKey(key);                                     // 存在判断
RedisUtil.expire(key, Duration.ofMinutes(N));              // 重设 TTL
```

**List / Set / Hash / ZSet**：完整签名见 [RedisUtil_API.md](references/RedisUtil_API.md)

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| `RedisUtil` 暂无所需方法 | 先在 `common-spring` 的 `RedisUtil` 中实现该方法，再在业务服务中调用；禁止绕过直接注入模板类 |
| 缓存击穿（热点 Key 失效） | `setIfAbsent` 加互斥锁，或回源后设随机 TTL（Base ± jitter） |
| 缓存穿透（查 null 值） | 缓存空对象（TTL 较短，如 60s）或使用布隆过滤器 |
| 不同服务读同一 Key（跨服务共享缓存） | Key 前缀归属到**生产者服务**的 CacheConst，消费者引用常量字符串 |
| `get` 返回 null 但业务要求非空 | Service 层判空后回源数据库，再写缓存 |
| 大 Key（Value > 10 KB） | 评估是否拆分或改用 Hash 分片存储 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [RedisUtil_API.md](references/RedisUtil_API.md) | 全量 API 方法签名速查 |
| [CacheConst.java](references/CacheConst.java) | Key 常量模版 |

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# Redis 使用规范（禁直接注入 RedisTemplate / 强制 TTL / CacheConst Key / 禁 Controller 调用）
bash ~/cursor/skills/java-redis/scripts/check-redis.sh <模块路径>

# Redis Key 命名 + CacheConst Javadoc（三段式 Key / 注释说明 TTL）
python3 ~/cursor/skills/java-redis/scripts/check-cache-const.py <模块路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
