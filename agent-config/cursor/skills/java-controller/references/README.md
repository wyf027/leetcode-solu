# Controller 层

**何时使用**：编写/优化 Controller、REST API、接口时。

> 接口层完整规范见 [REST_API_RULES](REST_API_RULES.md)，本文件为快速索引。

## 职责边界（最高优先级）

Controller 是**协议适配层**，方法体 ≤ 3 行，只做：解析入参 → 调 Service → 封装响应。

**禁止出现**：业务逻辑判断、Mapper 调用、数据拼装聚合、try-catch、`@Transactional`、异步任务触发、裸实体/裸集合出参。

## 强制约束

- 入参仅 DTO，出参仅 VO；Body 入参必须 `@RequestBody @Valid`
- 仅调用 Service，不直接调 Mapper
- 所有响应统一 `Result<T>` 封装，分页用 `Paged<T>`；DTO 转 VO 用 MapStruct
- RESTful URL：名词复数、小写连字符、无动词、`{id}` 在路径末尾、≤ 2 级嵌套
- HTTP 语义：GET 查询（`@RequestParam`）、POST 新增、PUT 全量更新、PATCH 部分更新、DELETE 删除
- 子资源嵌套路径示例：`GET /jobs/candidates/{jobId}`
- Content-Type：业务接口统一 `application/json`，禁止 Form 表单入参
- Controller 不 try-catch，业务异常抛 `BusinessException + ErrorCode`，由全局 `@RestControllerAdvice` 处理
- Long 字段序列化转 String；枚举返回 code + desc；日期加 `@JsonFormat`
- 纯关联表无需独立 Controller

## 详细规范速查

| 规范 | 链接 |
|------|------|
| 职责边界（禁止项正反例） | [REST_API_RULES § 零](REST_API_RULES.md#零controller-职责边界) |
| URL 设计 / Method 语义 | [REST_API_RULES § 一、二](REST_API_RULES.md#一url-设计) |
| 入参规范（GET / Body / 批量） | [REST_API_RULES § 三](REST_API_RULES.md#三入参规范) |
| 出参规范（Result / Paged / VO 字段） | [REST_API_RULES § 四](REST_API_RULES.md#四出参规范) |
| HTTP 状态码 / 异常处理 | [REST_API_RULES § 五、六](REST_API_RULES.md#五http-状态码约定) |
| Content-Type / 命名一致性 | [REST_API_RULES § 七、八](REST_API_RULES.md#七content-type-约定) |
| 审查清单 | [REST_API_RULES § 九](REST_API_RULES.md#九审查清单) |
