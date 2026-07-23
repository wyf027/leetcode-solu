# 代码交付审查清单

**何时使用**：凡是产出代码后必须执行，包括：整体任务完成、子任务完成、AI 生成、脚手架生成、批量补代码、重构改写。不需要用户提醒，**代码写完即触发**。

目标不是"看起来能跑"，而是确认：**实现正确、分层合理、可维护、可上线**。

> **执行规则**：三级优先级分步推进，每一级问题**必须全部修复后**才能进入下一级。

---

## 🔴 第一级：严查（注释 / 日志 / 测试）

> 代码可读性与可观测性的底线，**交付物不得存在本级问题**。

### 1. 注释 & @author 审查

**类级**
- [ ] 每个类（Controller/Service/Mapper/Entity/Listener/Convert/Handler）有类级 Javadoc：说明职责，标注 `@author` 和 `@since`
- [ ] Controller/Service/Mapper/Entity/Listener/Convert 不得省略类注释
- [ ] `@author` 格式为 `${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})`，其中 `${AUTHOR_NAME}` 来源于 `git config user.name`
- [ ] **禁止写死具体人名**（如 `zhangsan`、`LvYi`），必须使用变量由实际值替换
- [ ] `@since` 格式为 `yyyy/MM/dd`（当天日期）

**方法级**
- [ ] 公开方法有 Javadoc，说明：参数含义、返回值语义、可能抛出的业务异常（`@throws`）
- [ ] 私有方法若逻辑复杂或非显而易见，也需简短说明意图

**字段级**
- [ ] 枚举关联字段标注 `{@link XxxEnum}`，如 `/** 职位类型，见 {@link JobTypeEnum} */`
- [ ] 错误码字段标注 `{@link XxxErrorCode}`
- [ ] 布尔/是否字段注明 `0-xxx，1-yyy` 含义
- [ ] **字段注释必要性判断**：字段名本身已能完整表达含义（如 `baseUrl`、`readTimeoutMs`）→ 无需注释；以下情形**必须**加 Javadoc：
  - 描述基础设施数据结构（Redis key pattern、ZSet/Hash/String 类型及用途）
  - 字段单位/精度需要说明（如小时 vs 毫秒、MB vs 字节）
  - 字段值影响多处行为（如 TTL 同时决定多个 key 的过期时间）
  - `@ConfigurationProperties` 中默认值含义无法从字段名推导的字段

**方法内部步骤注释**
- [ ] 业务方法内部关键节点（校验、查询、计算、状态变更、发送消息等）必须有步骤注释，格式为 `// 1. xxx`、`// 2. xxx`
- [ ] 每个逻辑块之间空一行，步骤注释写在逻辑块上方
- [ ] 私有方法若封装了单一步骤，方法名已自描述时可省略方法内注释；若逻辑非显而易见，需简短说明意图

**注释内容质量**
- [ ] 注释写**意图（why）**，禁止逐行翻译代码（what）
- [ ] 禁止：注释说旧语义而代码已改（注释与代码不一致）
- [ ] 禁止：占位注释（`// TODO`/`// FIXME`/`// 待完善`）遗留到交付版本——必须处理或转 issue
- [ ] 禁止：注释掉的死代码块遗留（直接删除，依赖版本管理追溯）
- [ ] 禁止：无意义行尾注释（`int a = 1; // 赋值为 1`）

---

### 2. 日志审查

**分层约束**
- [ ] Mapper/DAO 层**不打**业务日志，由 Service 层记录
- [ ] 查询方法（高频）**不打** `log.info`，防止日志爆量

**写操作必须有完整日志链路（create / update / remove 逐个检查）**
- [ ] `create` 方法入口有 `log.info("xxx - 创建 - 开始: ...")`，完成有 `log.info("xxx - 创建 - 成功: id = {}", ...)`
- [ ] `update` 方法入口有 `log.info("xxx - 更新 - 开始: id = {}", ...)`，完成有 `log.info("xxx - 更新 - 成功: id = {}", ...)`
- [ ] `remove` 方法入口有 `log.info("xxx - 删除 - 开始: id = {}", ...)`，完成有 `log.info("xxx - 删除 - 成功: id = {}", ...)`
- [ ] 业务拦截（NOT_FOUND / 唯一性冲突 / 状态非法）抛出前有 `log.warn`，记录触发条件

**复杂逻辑日志覆盖（按方法体行数逐档检查）**
- [ ] **< 10 行**：无需日志
- [ ] **10 ～ 30 行**：须有主链路日志（开始 + 成功）+ 最重要的关键节点 **1 条**（如：查询结果为空的早返回、状态变更、外部调用）
- [ ] **30 ～ 100 行**：须有主链路日志（开始 + 成功）+ 关键节点**多条**（每个步骤） + `if`/`switch` **每条分支各 1 条**日志（说明走了哪条路及原因）

**消息格式（逐条核对，无任何豁免）**
- [ ] **【铁律】所有 `log.info/warn/error/debug` 一律严格三段式** `"业务名 - 操作 - 操作结果: key = {}, key2 = {}"`，**启动初始化、Configuration、工具类、Filter/Listener、异常处理器全部不豁免**
- [ ] `业务名` 为**简洁中文**领域/模块名（业务侧：`岗位配置`、`试卷`；基础设施：`网关`、`MQ`、`异步任务`、`雪花ID`、`MybatisPlus`、`日期序列化`）
- [ ] `操作` 为**简洁中文**动作短语（业务：`创建`、`更新`、`审批`；初始化：`初始化JwtDecoder`、`注册过滤器`）
- [ ] `操作结果` 为**简洁中文**短语（常用：`开始`、`成功`、`失败`、`跳过`、`命中缓存`；业务化原因可自由表达，如 `名称重复`、`状态非法`）
- [ ] **kv 的 key 必须为英文标识符**且与代码变量名一致（便于 grep 排查）：`id = {}, orderId = {}`，禁止 `订单号 = {}`
- [ ] `=` **两侧各有一个空格**（正：`id = {}`，错：`id={}`）
- [ ] 多个 kv 用 `, ` 分隔（逗号后有空格）

**业务标识**
- [ ] 每条日志必须携带至少一个业务标识（`id`/`name`/`code` 等），禁止打印无上下文的纯文字描述日志（如 `log.info("操作 - 完成 - 成功")` 不带 kv 禁止）

**占位符 & 异常**
- [ ] 统一用占位符 `{}`，禁止字符串拼接（`"id=" + id`）——日志关闭时拼接仍有开销
- [ ] 异常日志带上下文 + exception 对象作为**最后一个独立参数**，不加 `{}`：`log.warn("xxx - 操作 - 失败: id = {}", id, e)`
- [ ] 禁止用 `e.getMessage()` 替代 `e`（丢失堆栈）

**安全**
- [ ] 日志**禁止**出现：密码、token、身份证号、手机号、银行卡号、加密密钥
- [ ] 禁止整包序列化对象：`log.info("{}", JSON.toJSON(entity))`——含大字段时打爆，含敏感字段时泄露

**级别**
- [ ] 正常业务流程用 `info`
- [ ] 预期内的非致命异常（如重试）用 `warn`，并说明原因
- [ ] 需人工介入、影响服务可用性的错误用 `error`
- [ ] 禁止 `System.out.println`、`e.printStackTrace()`

---

### 3. 测试用例

**关键节点覆盖率（逐项核查，缺一不可）**

- [ ] 每个**卫语句 / 前置校验**都有对应的失败场景：
  - 入参为空 / 列表为空 → 方法提前返回或抛出异常
  - 记录不存在（NOT_FOUND）→ 抛出对应错误码
  - 唯一性冲突 → 抛出对应错误码
  - 状态非法（当前状态不允许该操作）→ 抛出状态错误码
- [ ] 状态流转：合法路径（状态正常变更）+ 至少一条非法跳转（已发布再发布 → 报错）
- [ ] 写操作的副作用验证：`verify(mapper).insert(...)` / `verify(mqUtil).send(...)` / 缓存写入
- [ ] 边界值：空集合、临界值（上限/下限）、超上限入参

**完整链路（强制，至少一条）**

- [ ] 必须存在一条覆盖**完整主流程**的测试：方法入口 → 所有关键步骤 → 持久化/外部调用 → 返回值断言
- [ ] 完整链路测试中所有 Mock 依赖须**显式 stub**，不依赖框架默认返回值
- [ ] 完整链路测试结束后用 `verifyNoMoreInteractions` 或指定 verify 确认无意外调用

**基础要求**

- [ ] 测试用例可独立运行，无对外部全局状态的强依赖（不依赖执行顺序、不污染共享状态）
- [ ] 若暂时无法编写测试，**必须明确说明**：已验证哪些路径、未验证哪些路径、剩余风险是什么

---

### 4. 文件规模

- [ ] **单文件行数 ≤ 1000 行**（推荐上限）：超出则评估是否拆分为多个类或提取私有方法
- [ ] **单文件行数禁止超过 1200 行**（硬性上限）：超过 1200 行必须拆分，否则**阻断提交**
- [ ] **单方法体行数 ≤ 30 行**（推荐上限）：超出须提取私有方法
- [ ] **单方法体禁止超过 100 行**（硬性上限）：超过 100 行必须拆分，否则**阻断提交**
- [ ] 拆分优先策略：大方法 → 私有方法 → 独立类（`XxxValidator` / `XxxBuilder` / `XxxHelper`）

---

### 5. Service 职责边界

**单一职责**
- [ ] 每个 Service 只负责一个业务领域，命名即职责（`JobConfigService` 管岗位配置，不处理候选人流程）
- [ ] 不存在一个 Service 同时注入 5 个以上不同域的 Service（信号：职责过重需拆分）

**依赖方向**
- [ ] **禁止反向依赖**：低层 Service（如 `AnswerRecordService`）不得注入高层业务聚合 Service（如 `AssessmentFlowService`）
- [ ] 依赖关系只能从上往下：Controller → Service → Mapper，聚合 Service → 子域 Service
- [ ] **允许平行域调用**：同级平行业务 Service 之间可以直接注入调用
- [ ] 平行域出现循环依赖时，在注入点加 `@Lazy` 打破，**禁止**为绕开循环而退化为直接注入 Mapper

**入参 / 出参边界**
- [ ] Service 方法入参为 DTO 或基础类型（Long/String 等）
- [ ] Service 方法出参为 DTO / VO / Entity / 基础类型
- [ ] **禁止**直接传递 `HttpServletRequest` / `HttpServletResponse` / `HttpSession` 等 Web 对象——在 Controller 层提取所需字段后以 DTO 传入
- [ ] **禁止**跨微服务直接 Mapper 复用——跨服务数据需求必须通过 `*-api` Feign 或 MQ

---

### 6. API 模块审查（涉及 *-api 模块变更时逐项检查）

**Feign 客户端**
- [ ] `@FeignClient(name = "{service}-service", contextId = "xxxApi")`：name 与目标服务一致，contextId 全局唯一
- [ ] Feign 方法路径与 Controller `@RequestMapping` + `@GetMapping`/`@PostMapping` **完全一致**，含前缀
- [ ] Feign 方法参数注解与 Controller 完全一致（`@PathVariable("id")` 不省略 value）
- [ ] 出参统一 `Result<T>`，与 Controller 返回类型保持一致
- [ ] 消费方启动类有 `@EnableFeignClients(basePackages = "com.succaiss.{source}.api.feign")`

**跨服务 DTO**
- [ ] 放在 `{service}-api/dto/`，实现 `Serializable`，含 `@Serial private static final long serialVersionUID = 1L`
- [ ] 只包含消费方实际需要的字段，**禁止**复制 Entity 全字段
- [ ] 非 `final` 字段禁止任何基本类型，必须使用包装类型；`final` 字段、`serialVersionUID` 这类 `static final` / `final static` 常量除外
- [ ] 字段变更遵守**向后兼容**：只增字段，不改/删字段名；删除需协调所有消费方
- [ ] 有 `@NoArgsConstructor`（JSON 反序列化依赖无参构造）
- [ ] 消费方直接 `.getData()` 取值，**禁止**冗余判断 `result.getCode() != 200`（网关已保证）

**MQ 消息体（Message）**
- [ ] 放在 `{service}-api/message/`，实现 `Serializable`，含 `serialVersionUID`
- [ ] 有 `@NoArgsConstructor` + `@AllArgsConstructor`
- [ ] 只含消费端需要的字段，**禁止**冗余字段和敏感字段
- [ ] 跨服务 Topic/Tag 常量放 `{service}-api/constant/MqConst.java`，消费方直接 import，**禁止**重复定义

---

### 5. MQ Listener 审查（涉及消息消费时逐项检查）

**类结构**
- [ ] 继承 `BaseListener<T>` 并重写 `onPayload`
- [ ] `@RocketMQMessageListener` 注解：topic 引用 `MqConst` 常量，consumerGroup 全局唯一且有业务语义
- [ ] 一个 Listener 只处理一个 Topic+Tag 组合，**禁止**在 `onPayload` 中按 tag 做 if-else 分流

**入参校验**
- [ ] `onPayload` 入口对 payload **非空校验**：`payload == null` 时 `log.warn` + 直接 return
- [ ] 关键业务字段（如 `bizId`、`companyId`）**逐个校验非空**，缺失时 `log.warn` + return，**禁止**用 `@Valid`
- [ ] 校验日志格式：`log.warn("listener名 - 校验 - 字段缺失: field = null, payload = {}", payload)`

**幂等处理**
- [ ] 重复消息不产生重复副作用：先查状态再操作（模式 A），或 DB 唯一约束兜底（模式 B）
- [ ] 已是终态时 `log.info` 记录跳过原因，直接 return，**不抛异常**
- [ ] 幂等场景有对应 `[IDEM-xx]` 测试用例

**异常处理**
- [ ] 业务异常**向上传播**，由 RocketMQ 重试机制处理，**禁止** try-catch 后静默 return
- [ ] 不可恢复异常（参数缺失、数据不存在）`log.warn` 后直接 return，避免无限重试

---

### 6. DDL / SQL 审查（涉及建表或 SQL 变更时逐项检查）

**表结构**
- [ ] 通用字段（id/created_by/updated_by/created_at/updated_at）由 `BaseEntity` 提供，子类**禁止**重复声明
- [ ] 表名、字段名全小写下划线，**禁止**大写字母和驼峰
- [ ] 字符集 `utf8mb4`，排序规则 `utf8mb4_general_ci`
- [ ] 每个表和每个字段都有 `COMMENT`
- [ ] 逻辑删除字段为 `is_deleted TINYINT(1) DEFAULT 0 COMMENT '逻辑删除：0-正常，1-已删除'`

**字段类型**
- [ ] 金额用 `DECIMAL(precision, scale)`，**禁止** `FLOAT`/`DOUBLE`
- [ ] 状态/类型用 `TINYINT` 或 `SMALLINT`，**禁止** `INT` 浪费空间
- [ ] 文本短于 256 字符用 `VARCHAR(N)`，长文本用 `TEXT`
- [ ] 时间用 `DATETIME`，**禁止** `TIMESTAMP`（2038 年溢出）
- [ ] JSON 结构用 `TEXT` + `COMMENT '存储格式：JSON，结构见 XxxDTO'`，**禁止**用 MySQL `JSON` 类型（MyBatis-Plus 映射不友好）
- [ ] Boolean 语义字段用 `TINYINT(1)`，命名 `is_xxx`（如 `is_enabled`、`is_deleted`）

**索引**
- [ ] 主键：`id BIGINT NOT NULL AUTO_INCREMENT`（或雪花 ID 无 AUTO_INCREMENT）
- [ ] 普通索引命名 `idx_{table}_{col1}_{col2}`，唯一索引命名 `uk_{table}_{col1}_{col2}`
- [ ] 高频查询条件有对应索引，`WHERE` 中的字段组合有覆盖索引
- [ ] 联合索引遵循最左前缀原则，区分度高的字段在前
- [ ] 逻辑删除 + 唯一约束场景：唯一索引包含 `is_deleted`，或改用 `deleted_at`（NULL 表示未删除）

**SQL 语句**
- [ ] 参数全部使用 `#{}` 占位符，**禁止** `${}` 拼接（防 SQL 注入），动态表名/列名除外需审批
- [ ] `IN` 子句有集合为空保护（空 IN 会导致语法错误或全表扫描）
- [ ] 分页查询带 `LIMIT`，**禁止**无限制的 `SELECT * FROM`
- [ ] `UPDATE` / `DELETE` 带 `WHERE` 条件，**禁止**无条件更新/删除
- [ ] 批量操作分批执行（每批 ≤ 500 条），避免单事务持锁过长

---

> **第一级输出要求**：列出所有发现的问题（注释/日志/测试/API/MQ/DDL），全部修复后才能进入第二级。

---

## 🟡 第二级：合规（分层 / 禁令 / 风格 / 安全）

> 工程规范与团队约定的强制要求，**交付物不得存在本级问题**。

### 1. 输入对齐

- [ ] 代码实现与需求/DDL/接口文档一致，无臆造字段、方法、依赖
- [ ] 生成代码覆盖了所有业务字段，无遗漏
- [ ] 修改范围收敛，无复制粘贴残留、无未使用代码、无调试代码

### 2. 分层与归属

- [ ] Entity 只留在 `{service}-service`，未泄漏到 Controller 或 VO
- [ ] VO 只包含前端需要的字段（无 `is_deleted`、密码、内部流转字段）
- [ ] Controller 方法体 ≤ 3 行，无业务逻辑，只做收参、调用、出参转换
- [ ] 跨域调用走 Service，跨服务只依赖 `*-api`，不直接注入其他域的 Mapper
- [ ] 无 `@Autowired`，Service 必须用 `@Resource`，Controller 用 `@RequiredArgsConstructor` 构造注入

### 3. 全局禁令

- [ ] Service 层无 `JSONObject`/`JSONArray`/`JSON.parseObject`
- [ ] 存在性判断用 `.select(id).one() != null`，禁止 `count() > 0` 或 `.exists()`
- [ ] 查询方法/单写操作无多余 `@Transactional`；多表更新或"先写库再发消息"的链路有事务保护
- [ ] 枚举实现 `BaseEnum`，错误码实现 `ErrorCode`，来自 `common-base`
- [ ] 无自定义 `BizException`、散落 `200/500`、新造 `success()/fail()`

### 4. REST 接口规范

- [ ] URL 全小写连字符，名词复数，无动词（`/job-configs`，非 `/getJobConfig`）
- [ ] 出参统一 `Result<XxxVO>`，无裸 Entity/裸 List
- [ ] 分页接口 `pageSize` 有上限保护（Controller 层校验 ≤ 100），超限返回 400
- [ ] 批量接口入参集合有数量上限（如 ≤ 500），超限返回业务错误码
- [ ] `@RequestBody` 入参加 `@Valid` / `@Validated`，DTO 字段有 `@NotNull`/`@NotBlank`/`@Size` 等校验注解
- [ ] 返回码语义正确：200 成功、400 参数错误、404 资源不存在、500 系统异常

### 5. 跨域禁令（Service 层）

- [ ] **禁止 Service 直接注入其他域的 Mapper**——跨域操作必须通过目标域的 Service 方法暴露接口，再由调用方注入该 Service
- [ ] **允许 Service 之间存在简单循环依赖**，必须在注入点加 `@Lazy` 打破循环，**禁止**为绕开循环而退化为直接注入 Mapper
- [ ] 常量类（如 Redis key 前缀）**禁止定义在 `*Impl` 类中对外暴露**，应提取到独立的 `XxxConst` / `CacheConst` 类统一管理

### 6. 安全审查

**敏感数据**
- [ ] VO/DTO/日志**禁止**包含密码、token、身份证号、手机号（完整）、银行卡号、加密密钥
- [ ] 手机号/身份证号展示场景须脱敏（`138****1234`、`310***********1234`）
- [ ] Entity 中的敏感字段在 Convert 时**不映射**到 VO

**注入防护**
- [ ] SQL 参数全部使用 `#{}` 占位符，**禁止** `${}` 拼接（防 SQL 注入）
- [ ] 用户输入不直接拼入 `@RequestMapping` 路径（防路径遍历）
- [ ] 文件上传校验扩展名白名单和 MIME type，限制文件大小

**访问控制**
- [ ] 跨服务调用走 Feign + 网关鉴权，**禁止**绕过网关直连内部服务
- [ ] 涉及数据权限的接口在 Service 层校验当前用户有权操作目标资源
- [ ] 管理端接口与 C 端接口分离，URL 前缀不同（如 `/admin/` vs `/api/`）

### 7. Entity / DTO / VO 边界

- [ ] `Entity` 仅承载持久化字段，不混入展示/流程态字段
- [ ] `DTO/VO` 按场景拆分，没有一个对象承载所有接口用途
- [ ] 生成代码没有直接复用 `Entity` 作为 Web 出参
- [ ] Create / Update / Query / List / Detail 的对象边界清晰
- [ ] **POJO 字段禁用任何基本类型**：Entity / DTO / VO / Request / Response 的非 `final` 字段禁止 `byte` / `short` / `int` / `long` / `float` / `double` / `boolean` / `char`，必须使用包装类型；`final` 字段、`static final` / `final static` 常量如 `serialVersionUID` 豁免；数组字段不纳入本规则

### 8. 代码风格（完整约定见 [CODE_STYLE](CODE_STYLE.md)）

**命名**
- [ ] 类 `UpperCamelCase`，方法/变量 `lowerCamelCase`，常量 `ALL_UPPER_CASE`
- [ ] 无拼音（`dingdan` → `order`）、无不规范缩写（`cnt` → `count`、`mgr` → `manager`）
- [ ] POJO 字段禁止任何基本类型，`boolean isXxx` 必须改为 `Boolean isXxx` 或重新命名；`Boolean` 装箱类型可保留 `isXxx`（Lombok 生成 `getIsXxx()`，Jackson 序列化字段名仍为 `isXxx`，无序列化丢字段问题）

**方法长度**
- [ ] 超过 30 行须提取私有方法
- [ ] **禁止超过 100 行**（硬性上限，超出必须拆分，否则**阻断提交**）

**防御性编程（卫语句 / 早返回）**
- [ ] 前置条件不满足时尽早 `return` / `throw`，主流程逻辑保持在最浅缩进层级
- [ ] **禁止**将主流程嵌套在深层 `if-else` 中（反例：`if (entity != null) { if (status == OK) { ... } else { throw } } else { throw }`）
- [ ] 参数为空 / 列表为空 → 直接 `return` 或 `return Collections.emptyList()`
- [ ] 记录不存在 → 调用 `findByIdOrThrow`，让 NOT_FOUND 在入口暴露
- [ ] 状态不合法 → 校验通过后再执行写操作，状态非法立即 `throw`

**格式 & 规范**
- [ ] 大括号不省略（`if/for/while` 单行也要 `{}`），`switch` 必须有 `default`
- [ ] 无无用 import、调试代码（`System.out.println`/`printStackTrace()`）、未使用变量
- [ ] Service 用 `@Resource`，Controller 用 `@RequiredArgsConstructor` 构造注入，未使用 `@Autowired`
- [ ] Lombok 使用克制：`@Data` 用于 POJO，有继承加 `callSuper = true`

**领域边界**
- [ ] 本域操作用 Mapper
- [ ] 跨域调用用 Service（不直接注入其他域 Mapper）
- [ ] 跨服务只依赖 `*-api`（不共享数据库、不直连）

### 9. Mapper / SQL

- [ ] SQL 查询字段与返回对象匹配，无漏查、错别名
- [ ] 批量查询/更新有 size 限制，避免超长 IN（集合为空时需前置保护）
- [ ] XML / 注解 SQL 中条件拼装安全、可读、可维护
- [ ] `lambdaQuery` / `lambdaUpdate` 链式调用可读（每个条件独立一行）
- [ ] 禁止 `SELECT *`，显式列出需要的字段或用 `.select(Entity::getField1, Entity::getField2)`

---

> **第二级输出要求**：列出所有发现的合规问题，全部修复后才能进入第三级。

---

## 🟢 第三级：建议（优化 / 性能 / 并发）

> 可维护性、性能与并发优化方向，**非阻断性**，可转 issue 跟进，不影响当次交付。

### 可维护性

- 重复逻辑是否可提取为私有方法或工具方法（减少复制粘贴）
- 复杂分支（if-else > 3 层）是否适合引入策略模式
- DTO/VO 对象职责是否过重（一个对象同时承担创建/更新/列表/详情多种场景）
- Convert 是否漏映射关键字段（列表页或详情页少字段）
- 常量/枚举是否集中管理，无魔法值 `1/0/2`、`"Y"`、`"SUCCESS"` 散落
- 集合/日期/基础 API 是否有误用（`size() == 0`、`YYYY`、`Arrays.asList` 后 add）
- 异常类型是否精确：区分 `BusinessException`（业务规则）与系统异常（NPE/IO），不混用

### 性能

- **N+1 查询**：列表查 N 条后循环查关联数据 → 改为批量 IN 或 JOIN 一次查出
- **循环查库**：`for (id : ids) { mapper.selectById(id) }` → 改为 `mapper.selectBatchIds(ids)`
- **无 LIMIT 保护**：无条件 `SELECT *` → 强制分页或加 `LIMIT`
- **批量写入未分批**：一次 `saveBatch(10000条)` → 按 500 条分批，避免单事务持锁过长
- **pageSize 无上限**：`pageSize=100000` 能通过 → Controller 校验 ≤ 100
- **缓存策略缺失**：高频接口（QPS > 10 或首屏路径）无缓存 → 评估 Redis 缓存可行性
- **响应时间**：高频接口目标 ≤ 100ms，普通接口目标 ≤ 150ms
- **大 Key 风险**：Redis Value > 10 KB → 评估拆分或改用 Hash 分片

### 并发安全

- **先查后写（Check-then-Act）**：`if (不存在) { insert }` → 加 DB 唯一约束 + 捕获 `DuplicateKeyException` 静默处理
- **计数器读-改-写**：`count = select(); count++; update(count)` → 改为 `UPDATE SET count = count + 1`（数据库原子操作）
- **状态竞态**：两线程同时通过状态校验 → 加乐观锁（`version` 字段）或 `SELECT ... FOR UPDATE`
- **MQ 重复消费**：消息重投触发重复处理 → 先查终态再操作，已是终态则跳过
- **分布式锁缺失**：跨实例并发写同一资源 → 评估 `RedisUtil.setIfAbsent` 作为分布式锁

---

## 审查输出模板

发现问题时，**每级输出「问题 + 风险 + 建议动作」**，不得只给笼统评价。

```markdown
## 审查结论

### 🔴 严查结论（注释 / 日志 / 测试）
- 问题：`PaperServiceImpl` 缺少类级 Javadoc，未标注 @author 和 @since
  - 风险：维护者无法快速了解类的职责边界
  - 建议：补充类级 Javadoc，说明职责，标注 @author、@since

- 问题：`createPaper` 方法日志使用字符串拼接：`log.info("id=" + id)`
  - 风险：日志级别关闭时仍有字符串构造开销
  - 建议：改为占位符 + 中文三段式：`log.info("试卷 - 创建 - 成功: id = {}", id)`

- 已验证：编译、主流程
- 未验证：并发提交
- 剩余风险：并发写场景可能存在重复数据

### 🟡 合规结论（分层 / 禁令 / 风格）
- 问题：`PaperController.create` 方法体超过 3 行，包含状态判断逻辑
  - 风险：Controller 层混入业务，后续复用困难
  - 建议：将状态判断逻辑下沉到 Service 层

### 🟢 优化建议
- 问题：`PaperServiceImpl.buildPaperDetail` 方法超过 80 行，包含多个独立职责
  - 风险：难以测试和维护
  - 建议：拆分为 `validatePaper`、`buildQuestionList`、`buildPaperResult` 等私有方法
```

---

## 代码生成常见问题（优先怀疑）

- [ ] **字段看起来齐全，但语义错位**：如 `status`、`type`、`source` 混用
- [ ] **对象过度复用**：一个 DTO 同时承担创建、更新、列表、详情
- [ ] **只补 happy path**：缺参数为空、数据不存在、越权、重复提交校验
- [ ] **状态流转不完整**：允许从任意状态直接跳终态
- [ ] **事务遗漏**：多表更新或"先写库再发消息"没有边界保护
- [ ] **Convert 漏字段**：列表页或详情页少映射关键字段
- [ ] **SQL 性能差**：循环查库、未限制分页、动态 SQL 条件错误
- [ ] **重复造轮子**：新建 `BizException`、自定义 Result、手写枚举工具
- [ ] **注释和日志失真**：代码改了，注释/日志还是旧语义
- [ ] **残留占位内容**：`TODO`、`test`、`demo`、`mock`、无用方法未清理
