---
name: java-api
description: >-
  规范 Java 微服务 *-api 模块的设计与使用，定义服务对外暴露的跨服务契约。
  涵盖：api 层放什么（判断决策树）、Feign 客户端编写、跨服务 DTO 设计、MQ 消息体（Message）设计、跨服务 MqConst 归属、包结构约定。
  适用于：新建 Feign 接口、跨服务调用、编写 *-api 模块、FeignClient、跨服务 DTO、MQ 消息体、api 层设计、对外契约、接口暴露。
compatibility: Java 17+, Spring Boot 3+, Spring Cloud OpenFeign
metadata:
  domain: java-microservice
  layer: api
---

# *-api 模块规范

`*-api` 是服务对外暴露的**契约模块**，其他服务只依赖 `*-api`，不依赖 `*-service`。

---

## 什么放 *-api？

```
其他服务需要消费？
├── HTTP 调用  → Feign 接口 + 对应 DTO（feign/ + dto/）
├── MQ 消费    → 消息体类 + MqConst（message/ + constant/）
└── 枚举/错误码 → 仅当其他服务需要引用时才放 api 层
```

**禁止放入 *-api 的内容**：Entity、Mapper、ServiceImpl、`@Service`/`@Component` 等 Spring Bean。

---

## 包结构约定

```
{service}-api/src/main/java/com/succaiss/{service}/api/
├── feign/           # Feign 客户端接口
├── dto/             # Feign 入参/出参 DTO
├── message/         # MQ 消息体（跨服务消费）
├── constant/        # 跨服务 MQ 常量（MqConst）
└── enums/           # 跨服务共用枚举（按需）
```

---

## 步骤：新建 Feign 客户端

1. 确认要暴露的 Controller 接口的完整路径（含 `@RequestMapping` 前缀）
2. 在 `{service}-api/feign/` 新建接口，注解参数与 Controller 完全一致：

   ```java
   @FeignClient(name = "{service}-service", contextId = "xxxApi")
   public interface XxxApi {

       @GetMapping("/xxx/{id}")          // 路径必须与 Controller 完全一致
       Result<XxxDTO> getById(@PathVariable("id") Long id);

       @PostMapping("/xxx")
       Result<Long> create(@RequestBody XxxDTO dto);
   }
   ```

3. 出参统一 `Result<T>`，与 Controller 返回类型保持一致
4. `contextId` 全局唯一，防止多 Feign 客户端冲突

**消费方**在启动类或配置类加 `@EnableFeignClients(basePackages = "com.succaiss.{source}.api.feign")`

---

## 第三方异步结果查询：每个变体对应独立 Feign 方法

当底层服务存在多种任务类型（如出题/评分、Paper/MCQ/Review）时，**每个变体对应一个 Feign 方法 + 一个独立路径**，禁止用 `Object`/`JsonNode`/`Map` 做公共"万能"返回：

```java
// ✅ 正确：各变体独立方法，返回强类型
@GetMapping("/result/exam")
Result<XxxResultVO<ExamData>> queryExamResult(@RequestParam String taskId);

@GetMapping("/result/score")
Result<XxxResultVO<ScoreData>> queryScoreResult(@RequestParam String taskId);

// ❌ 错误：Object/JsonNode/Map 不可见结构，消费方无法安全使用
@GetMapping("/result")
Result<Object> queryResult(@RequestParam String taskId);
```

对应 **Controller** 与 **Gateway** 同样拆分为同名的 `queryXxxResult`/`getXxxResult` 方法，不共用单一"万能"接口。

### Gateway 读 Redis 反序列化泛型 VO（必须用显式 TypeReference）

```java
// ✅ 正确：每个方法传入显式泛型 TypeReference
public XxxResultVO<ExamData> getExamResult(String id) {
    return readFromRedis(id, new TypeReference<XxxResultVO<ExamData>>() {});
}

// 公共私有方法接受 TypeReference，由调用方保证泛型完整性
private <T> T readFromRedis(String key, TypeReference<T> typeRef) {
    String json = redis.get(key);
    return objectMapper.readValue(json, typeRef);
}
```

---

## 消费方调用规范（重点）

网关已统一处理非 200 响应：当 `Result.code != 200` 时，网关直接抛出异常，Feign 调用不会正常返回。因此，**消费方 Service 层拿到返回值时，code 必然为 200，无需再判断**。

### ❌ 禁止的写法（冗余判断）

```java
Result<JobInfoDTO> jobResult = jobConfigApi.getDetail(jobId);
if (jobResult == null || jobResult.getCode() != ResultStatus.SUCCESS.code() || jobResult.getData() == null) {
    log.warn("OA - 生成 - 职位不存在或调用失败: jobId = {}", jobId);
    throw AssessErrorCode.JOB_NOT_FOUND.toEx();
}
JobInfoDTO jobInfo = jobResult.getData();
```

### ✅ 正确写法

```java
// 调用 hire 服务获取职位信息，网关保证正常返回时 code 必然为 200
JobInfoDTO jobInfo = jobConfigApi.getDetail(jobId).getData();
if (jobInfo == null) {
    log.warn("OA - 生成 - 职位不存在: jobId = {}", jobId);
    throw AssessErrorCode.JOB_NOT_FOUND.toEx();
}
```

> **说明**：`getData()` 的 null 检查保留——上游可能返回 `Result.ok(null)`（业务语义上"资源不存在"），这属于正常业务校验，不是网关层面的错误。

---

## 步骤：新建跨服务 DTO

1. 放 `{service}-api/dto/`，实现 `Serializable`
2. 加 `@Serial private static final long serialVersionUID = 1L`
3. 只包含消费方实际需要的字段（不要把 Entity 全字段复制过来）
4. 字段变更遵守**向后兼容**原则：只增字段，不改/删字段名

```java
@Data
public class XxxDTO implements Serializable {
    @Serial private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    // ...消费方需要的字段
}
```

---

## 步骤：新建 MQ 消息体（Message）

消息体放 api 层的条件：**其他服务订阅该 Topic/Tag**。

```java
@Data
@NoArgsConstructor                    // ✅ 必须：JSON 反序列化需要无参构造
@AllArgsConstructor
public class XxxMessage implements Serializable {
    @Serial private static final long serialVersionUID = 1L;

    private Long bizId;
    private Long companyId;
    // 只含消费端需要的字段，禁止冗余字段
}
```

---

## MqConst 归属

| 消费范围 | 常量位置 |
|---------|---------|
| 仅本服务消费 | `{service}-service/constant/MqConst.java` |
| 其他服务消费 | `{service}-api/constant/MqConst.java` |

跨服务 MqConst 写法（消费方直接 import 使用，禁止重复定义）：

```java
public final class MqConst {
    private MqConst() {}

    /** Topic：职位域事件 */
    public static final String TP_JOB = "tp_job";

    /** Tag：职位发布，消息体见 {@link JobPublishedMessage} */
    public static final String TAG_JOB_PUBLISH = "onJobPublish";
}
```

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| Controller 路径有变，Feign 路径忘记同步 | Feign 路径与 Controller 路径必须完全一致，变更时两处同步修改 |
| DTO 缺少 `@NoArgsConstructor` | JSON 反序列化失败；Feign 响应、MQ 消费均依赖无参构造 |
| 消费方 DTO 字段与生产方不一致 | 只增字段，不改/删；删除需协调所有消费方完成版本迁移 |
| 多个 Feign 客户端指向同一服务 | 每个 `@FeignClient` 设置唯一 `contextId`，否则 Spring 启动报 Bean 冲突 |
| 枚举需要跨服务共用 | 放 `{service}-api/enums/`；消费方 import api 包，禁止各自重复定义 |
| Message 字段需要敏感信息 | 禁止；日志/MQ 均不允许携带密码/token/手机号等敏感字段 |
| 第三方服务结果有多种类型 | 每种类型单独定义载荷 DTO + 单独 Feign 方法，禁止用 `Object`/`JsonNode`/`Map` 统一承接 |
| Jackson 泛型 VO 反序列化 | Gateway `readFromRedis` 须传入**显式** `TypeReference<完整泛型>() {}`；`<>` diamond 匿名类无法保留类型参数 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [XxxApi.java](references/XxxApi.java) | Feign 客户端模版 |
| [XxxMessage.java](references/XxxMessage.java) | MQ 消息体模版 |

**示例**：[JobConfigApi.java](assets/JobConfigApi.java) · [JobPublishedMessage.java](assets/JobPublishedMessage.java)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# API 模块规范（FeignClient contextId / @PathVariable value / DTO Serializable / 无参构造）
bash ~/cursor/skills/java-api/scripts/check-api.sh <api模块路径>
# 示例
bash ~/cursor/skills/java-api/scripts/check-api.sh ./assess-api/src

# POM 依赖方向（api 禁引入 service/web，禁引入重量依赖）
python3 ~/cursor/skills/java-project-structure/scripts/check-pom.py <项目根路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
