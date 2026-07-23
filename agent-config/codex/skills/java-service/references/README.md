# Service 层

**何时使用**：编写/优化 Service、业务逻辑、事务时。

## 强制约束

- @Resource 注入，禁止 @RequiredArgsConstructor（易循环依赖）
- 仅用本域 Mapper；跨域调其他 Service
- **事务按需加注**（禁止滥用 @Transactional）：
  - 查询方法：无需加事务注解
  - 仅包含单个写操作（insert/update/delete）：无需加事务注解，数据库单语句本身具有原子性
  - **复合操作**（多个写操作、或写操作中穿插读后写）：**必须**加 `@Transactional(rollbackFor = Exception.class)`，确保原子性
- 事务传播：跨 Service 注意 REQUIRED vs REQUIRES_NEW，避免嵌套事务意外回滚
- 业务异常 throw ErrorCode.toEx()，禁止吞异常；不向 Web 抛 checked Exception；**抛出前必须 `log.warn` 记录触发条件**（NOT_FOUND、唯一性冲突等）
- 入参 Entity/DTO，出参 DTO（Web 层再转 VO）；入参保护（size、范围）
- **禁止在 Service 层出现任何 JSON 操作**（如 `JSONObject`、`JSONArray`、`JSON.parseObject`、`objectMapper.readValue` 等）；字段传递必须使用 DTO，结构化数据转换通过 Convert 完成

  **❌ 错误示范**：

  ```java
  // Service 层直接操作 JSON，类型不安全、语义不清晰
  public void saveConfig(String configJson) {
      JSONObject obj = JSON.parseObject(configJson);
      String name = obj.getString("name");
      Integer level = obj.getInteger("level");
      // ...
  }

  // 将 JSON 字符串当作字段在层间传递
  public String getTagConfig(Long tagId) {
      TagEntity tag = findByIdOrThrow(tagId);
      return tag.getConfig(); // 返回原始 JSON 字符串给调用方
  }
  ```

  **✅ 正确示范**：

  ```java
  // 接收结构化 DTO，类型安全，意图明确
  public void saveConfig(TagConfigDTO dto) {
      TagEntity entity = tagConvert.toEntity(dto);
      this.save(entity);
  }

  // 出参使用 DTO，JSON 反序列化在 Convert 内完成
  public TagConfigDTO getTagConfig(Long tagId) {
      TagEntity tag = findByIdOrThrow(tagId);
      return tagConvert.toConfigDTO(tag); // Convert 内部处理 JSON→DTO 映射
  }
  ```

  > **原则**：JSON 序列化/反序列化属于**数据格式转换**，应收敛在 Convert 或持久层边界处理；Service 层只感知业务对象（DTO/Entity），不感知传输格式。
- 简单操作用 MyBatis-Plus Lambda（lambdaQuery/lambdaUpdate），复杂 SQL 用 Mapper；详细选型与代码片段见 [MYBATIS_PLUS_SINGLE_TABLE](../mapper/MYBATIS_PLUS_SINGLE_TABLE.md)
- **日志强制要求**（见日志规范章节）：
  - 所有 public **写操作**方法入口加 `log.info("业务名 - 操作 - 开始: key = {}", val)`（业务名/操作/操作结果用中文，kv key 用英文）
  - 所有 public **写操作**方法完成后加 `log.info("业务名 - 操作 - 成功: id = {}", id)`
  - 抛出业务异常前加 `log.warn`，记录触发条件（id、code、name 等关键字段）
  - 禁止在 Service 层使用 `log.error`（异常由全局处理器统一记录）
  - 禁止打印敏感字段（密码、身份证、手机号等）
  - 禁止在循环内使用 `log.info`（改用循环外汇总或 `log.debug`）
- **关键节点注释强制要求**：
  - 写操作方法内每个逻辑阶段（校验 / 转换 / 持久化 / 发消息）必须有意图注释（解释"为什么"而非"做什么"）
  - 非显而易见的技术决策（入参上限、count 短路、copyToEntity 原因）必须有注释说明
  - 禁止写复述代码行为的注释（如 `// 保存实体`、`// 查询用户`）

## 策略模式

复杂多分支/多类型业务采用策略模式：定义策略接口，各分支独立实现，通过 Spring 注入 `Map<String, Strategy>` 选择执行。
