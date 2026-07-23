# RedisUtil API 速查

来源：`com.succaiss.commons.spring.redis.RedisUtil`（common-spring 模块）

---

## String（Value）

| 方法 | 说明 |
|------|------|
| `set(key, value)` | 写入，**无 TTL，业务缓存禁用** |
| `set(key, value, Duration)` | 写入并设置过期时间（推荐） |
| `set(key, value, long, TimeUnit)` | 写入并设置过期时间 |
| `setIfAbsent(key, value)` | SETNX，Key 不存在时写入 |
| `setIfAbsent(key, value, Duration)` | SETNX + TTL（分布式锁推荐） |
| `setIfAbsent(key, value, long, TimeUnit)` | SETNX + TTL |
| `get(key)` | 读取字符串，不存在返回 `null` |
| `get(key, Class<T>)` | 读取并反序列化为目标类型 |
| `increment(key, delta)` | 原子自增，返回自增后的值 |
| `delete(key)` | 删除，返回 `true`=删除成功 |
| `hasKey(key)` | 判断 Key 是否存在 |
| `expire(key, Duration)` | 重设 TTL |

---

## List（`RedisUtil.List.*`）

| 方法 | 说明 |
|------|------|
| `rightPush(key, value)` | 从右侧插入单个元素 |
| `rightPushAll(key, Collection<T>)` | 从右侧批量插入 |
| `leftPush(key, value)` | 从左侧插入单个元素 |
| `leftPop(key)` | 从左侧弹出（返回字符串） |
| `leftPop(key, Class<T>)` | 从左侧弹出并反序列化 |
| `rightPop(key)` | 从右侧弹出（返回字符串） |
| `rightPop(key, Class<T>)` | 从右侧弹出并反序列化 |
| `range(key, start, end)` | 按下标区间读取字符串列表 |
| `range(key, start, end, Class<T>)` | 按下标区间读取并反序列化 |
| `size(key)` | 获取列表长度 |

---

## Set（`RedisUtil.Set.*`）

| 方法 | 说明 |
|------|------|
| `add(key, value)` | 添加单个元素 |
| `add(key, Collection<T>)` | 批量添加 |
| `members(key)` | 获取全部成员（字符串） |
| `members(key, Class<T>)` | 获取全部成员并反序列化 |
| `isMember(key, value)` | 判断元素是否属于集合 |
| `remove(key, value)` | 删除元素 |
| `size(key)` | 获取集合大小 |

---

## Hash（`RedisUtil.Hash.*`）

| 方法 | 说明 |
|------|------|
| `put(key, hashKey, value)` | 写入单个字段 |
| `putAll(key, Map<String, T>)` | 批量写入 |
| `get(key, hashKey)` | 读取字段（字符串） |
| `get(key, hashKey, Class<T>)` | 读取字段并反序列化 |
| `entries(key)` | 读取全部字段（`Map<String, String>`） |
| `entries(key, Class<T>)` | 读取全部字段并反序列化 |
| `putIfAbsent(key, hashKey, value)` | 字段不存在时写入（HSETNX），true=写入成功 |
| `increment(key, hashKey, delta)` | 字段原子自增（HINCRBY），返回自增后的值 |
| `hasKey(key, hashKey)` | 判断字段是否存在 |
| `delete(key, hashKey)` | 删除字段 |
| `size(key)` | 获取字段数量 |

---

## ZSet（`RedisUtil.ZSet.*`）

| 方法 | 说明 |
|------|------|
| `add(key, value, score)` | 添加元素并指定分值 |
| `range(key, start, end)` | 按分值升序读取区间（字符串） |
| `range(key, start, end, Class<T>)` | 按分值升序读取区间并反序列化 |
| `score(key, value)` | 获取成员分值 |
| `remove(key, value)` | 删除成员 |
| `size(key)` | 获取集合大小 |

---

## 序列化规则

| 值类型 | 存储形式 |
|--------|--------|
| `String` | 原始字符串 |
| `Number` / `Boolean` | `toString()` |
| 其他对象 | `JSONUtil.toJsonStr(value)`（Hutool JSON） |

反序列化：`JSONUtil.toBean(value, targetType)`
