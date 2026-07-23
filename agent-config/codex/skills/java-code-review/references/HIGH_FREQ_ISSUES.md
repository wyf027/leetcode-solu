# 高频问题速查（正例 / 反例对比）

## `@ConfigurationProperties` 字段缺少 Javadoc，基础设施语义靠猜

```java
// ❌ 字段名无法表达 Redis 数据结构用途，阅读者需翻 GatewayImpl 才能理解
@ConfigurationProperties(prefix = "ai-microservice")
public class AiMicroserviceProperties {
    private Integer taskTtlHours = 4;
    private String pendingZsetKey = "ai-microservice:pending";
    private String taskHashPrefix = "ai-microservice:task:";
    private String businessKeyPrefix = "ai-microservice:biz:";
}

// ✅ 对"名字无法自解释"的字段补 Javadoc，说明数据结构类型、用途、影响范围
@ConfigurationProperties(prefix = "ai-microservice")
public class AiMicroserviceProperties {

    /**
     * AI 任务在 Redis 中的缓存时长（小时）。
     * <p>影响范围：任务状态 key（{@code ai:task:{taskId}}）和结果 key（{@code ai:result:{taskId}}）的 TTL。
     */
    private Integer taskTtlHours = 4;

    /**
     * 待重试任务的 ZSet key（Redis Sorted Set）。
     * <p>score = 下次重试的 Unix 时间戳（秒），member = taskId。
     */
    private String pendingZsetKey = "ai-microservice:pending";

    /**
     * 任务元数据 Hash 的 key 前缀，完整 key = {@code prefix + taskId}。
     * <p>Hash 字段存储：businessId、taskType、重试次数、最后请求时间等。
     */
    private String taskHashPrefix = "ai-microservice:task:";

    /**
     * 业务幂等 key 前缀，完整 key = {@code prefix + businessKey}，value = taskId。
     * <p>防止同一业务请求重复创建 AI 任务。
     */
    private String businessKeyPrefix = "ai-microservice:biz:";
}
```

> **强制规则**：**所有字段必须有 Javadoc**，无例外。即使字段名看似自解释（如 `baseUrl`、`readTimeoutMs`），也必须补充注释说明含义、单位、默认值语义或影响范围；描述 Redis 数据结构类型/key pattern 的字段更应详细说明 score 含义、member 格式、TTL 影响等。

---

## 注释与代码语义脱节

```java
// ❌ 代码改了，注释还在描述旧逻辑
/** 根据用户 ID 查询用户信息 */
public JobConfigDTO getByCode(String code) { ... }

// ✅ 注释同步更新
/** 根据职位编号查询职位配置，不存在时返回 null */
public JobConfigDTO getByCode(String code) { ... }
```

---

## 日志消息格式不规范

格式要求：`"业务名(中文) - 操作(中文) - 操作结果(中文): key = {}, key2 = {}"`，业务名/操作/操作结果三段必须为中文，kv 的 key 必须为英文标识符（与变量名一致便于 grep），`=` 两侧各一个空格。

```java
// ❌ 缺少"业务名"段，格式不完整
log.info("创建 - 开始: name = {}", dto.getName());

// ❌ 业务名/操作用英文（CR-07a）
log.info("user - create - start: name = {}", dto.getName());

// ❌ kv 的 key 用中文（CR-07g，无法 grep 变量名）
log.info("用户 - 创建 - 开始: 姓名 = {}", dto.getName());

// ❌ = 两侧无空格
log.info("用户 - 创建 - 开始: name={}", dto.getName());

// ✅ 完整格式
log.info("用户 - 创建 - 开始: name = {}", dto.getName());
log.info("岗位配置 - 创建 - 成功: id = {}", entity.getId());
log.warn("岗位配置 - 审批 - 状态非法: id = {}, status = {}", id, entity.getStatus());
```

---

## 日志打印敏感字段或整包序列化

```java
// ❌ 泄露敏感字段 / 大字段打爆日志
log.info("用户 - 创建 - 开始: dto = {}", JSON.toJSON(dto));

// ✅ 只打业务关键字段
log.info("用户 - 创建 - 开始: name = {}, phone = {}", dto.getName(), desensitize(dto.getPhone()));
```

---

## 日志用字符串拼接而非占位符

```java
// ❌ 每次调用都构造字符串，即使日志级别关闭也有开销
log.info("岗位配置 - 创建 - 成功: id = " + entity.getId());

// ✅ 日志级别关闭时跳过参数求值
log.info("岗位配置 - 创建 - 成功: id = {}", entity.getId());
```

---

## Service 中直接解析 JSON

```java
// ❌ 生成代码常见错误
JSONObject json = JSON.parseObject(entity.getConfig());

// ✅ 定义 DTO，通过 Convert 转换
JobConfigDetailDTO detail = jobConfigConvert.toDetailDTO(entity);
```

---

## Controller 写了业务判断

```java
// ❌ 生成代码常见错误
if (dto.getStatus() == 1 && dto.getScore() > 60) { jobService.approve(dto.getId()); }

// ✅ 逻辑下沉到 Service
return Result.ok(jobService.process(dto));
```

---

## Service 跨域直接注入其他域的 Mapper

```java
// ❌ PaperQuestionService 跨域持有 QuestionMapper / PaperMapper
@Resource
private QuestionMapper questionMapper;   // 跨域！question 域的 Mapper
@Resource
private PaperMapper paperMapper;         // 跨域！paper 域的 Mapper

// ✅ 通过目标域 Service 暴露方法，@Lazy 打破循环依赖
@Lazy
@Resource
private QuestionService questionService; // 本域调用跨域 Service，@Lazy 解决循环

@Lazy
@Resource
private PaperService paperService;

// 目标域 Service 需补充对应方法
// QuestionService：int removeOaAiGeneratedByIds(List<Long> ids);
// PaperService：List<Long> listIdsByJobId(Long jobId);
```
