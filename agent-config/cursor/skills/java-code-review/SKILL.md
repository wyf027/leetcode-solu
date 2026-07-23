---
name: java-code-review
description: >-
  Java 微服务代码审查与代码风格规范，AI 生成或脚手架生成代码后交付前必须执行，也适用于重构后的风格自查。
  涵盖：分层正确性（Entity/DTO/VO 边界）、全局禁令（事务滥用/COUNT存在性/Service层JSON）、common-base 复用、REST 接口规范、
  代码风格（命名/方法长度/领域边界/禁止平行协议）、注释审查（Javadoc/意图注释/死代码）、日志审查（级别/占位符/敏感字段）。
  适用于：代码审查、代码风格检查、AI 生成代码交付前检查、脚手架代码 review、重构后验收、命名规范、消除坏味道、提测前检查。
compatibility: Java 17+, Spring Boot 3+
metadata:
  domain: java-microservice
  layer: review
---

# 生成代码审查

**【强制】** AI 生成、脚手架生成、批量补代码完成后，**交付前必须执行审查，不得跳过**。

## 审查前置

进入本 skill 前，先过一次 `agent-guardrails`，避免把 review 做成泛化风格巡检。

审查优先级固定为：

1. correctness、行为回归、边界条件
2. 运行时资源安全、OOM 风险、多实例安全、事务、缓存、MQ、外部调用风险
3. 测试覆盖是否足以证明改动成立
4. 最后才是命名、注释、风格一致性

## 执行方式（强制）

**【强制】** 代码审查必须通过 subagent 执行，主 agent 不直接审查：

- **subagent 类型**：`generalPurpose`（需要执行 `bash scripts/*.sh` 等检查脚本与跨文件分析）；只读探索类审查可用 `explore`
- **模型选择**：**不传 `model` 参数**，subagent 自动沿用主 agent 当前的模型（避免出现"主模型 Opus、子模型 Sonnet 风格基线不一致"的歧义）；只有用户明确点名某个模型时才传
- **任务描述要点**：必须包含①审查目标（模块路径/diff 范围）、②本 skill 的脚本入口列表（`check-global-bans.sh` / `check-pojo.sh` / `check-lombok.sh` 等）、③要求按「严查结论」格式回报错误数与 P0/P1/P2 分级
- **结果接收**：subagent 回报结论后，主 agent 负责裁决（哪些立刻修、哪些拆批、哪些豁免），不要让 subagent 越权直接改代码

为何必须用 subagent：审查过程会大量读文件、跑脚本、列错误，主 agent 上下文若混入这些噪声会污染后续修复决策；隔离到 subagent 可保证主 agent 拿到的是干净的「结论 + 证据」。

## 规范文件

| 文件 | 用途 |
|------|------|
| [GENERATED_CODE_REVIEW](references/GENERATED_CODE_REVIEW.md) | 完整审查清单（逐项检查） |
| [CODE_STYLE](references/CODE_STYLE.md) | 代码风格完整约定（含正例/反例） |
| [REVIEW_EXAMPLE](assets/REVIEW_EXAMPLE.md) | 审查示例（正例/反例对比） |

---

## 审查流程（按顺序执行）

**第一步：对齐输入**
- 对照需求/DDL/接口文档，确认代码没有臆造字段、接口、枚举值、依赖类
- 生成代码是否覆盖了所有业务字段（有无遗漏字段）

**第二步：验证分层**
- [ ] Entity 是否留在 `{service}-service`，未泄漏到 Controller
- [ ] VO 是否只包含前端需要的字段（无 `is_deleted`、密码、内部流转字段）
- [ ] Controller 方法体是否 ≤ 3 行，无业务逻辑

**对照需求/DDL/接口文档，完成以下检查后，输出「严查结论」。注释规范见第七步，日志规范见第八步。**

#### 文件规模
- [ ] **单文件行数 ≤ 1000 行**（推荐上限）：超出则评估是否拆分为多个类或提取私有方法
- [ ] **单文件行数禁止超过 1200 行**（硬性上限）：超过 1200 行必须拆分，否则**阻断提交**
- [ ] **测试目录例外**：`src/test/java` 下文件 warn=1500 / block=2500（工具类全覆盖测试天然较长，仅显著超长时阻断）
- [ ] 拆分优先策略：大方法 → 私有方法；多职责类 → 独立类（`XxxValidator`/`XxxBuilder`/`XxxHelper`）

#### 测试用例
- [ ] **关键节点覆盖**：每个卫语句（入参为空 / NOT_FOUND / 唯一性冲突 / 状态非法）都有对应失败场景测试
- [ ] **状态流转**：合法路径 + 至少一条非法跳转场景
- [ ] **副作用验证**：写操作须 `verify` 持久化调用、MQ 发送、缓存操作
- [ ] **完整链路（强制）**：至少一条覆盖完整主流程的测试，所有 Mock 依赖显式 stub，结尾验证无意外调用
- [ ] 测试用例可独立运行，无对外部全局状态的强依赖
- [ ] 若暂时无法编写测试，须明确说明：已验证哪些路径、未验证哪些路径、剩余风险

#### 运行时资源安全（P0 / P1）
- [ ] **P0：禁止大文件 / 外部流全量读入内存**：生产路径禁止 `InputStream.readAllBytes()`、`IOUtils.toByteArray()`、`ByteStreams.toByteArray()`、`FileUtils.readFileToByteArray()`、`StreamUtils.copyToByteArray()` 等无上限堆内存加载；视频、音频、附件、简历、导入导出必须优先流式处理或明确大小上限
- [ ] **P0：禁止无界资源**：禁止无界 `LinkedBlockingQueue`、`Executors.newCachedThreadPool()`、无退出条件 `while(true)`；线程池必须有容量、超时、拒绝策略和降级说明
- [ ] **P0：禁止 JVM 本地共享状态缓存**：禁止用 `static Map`、`ConcurrentHashMap`、`AtomicReference`、`volatile` 字段保存 token、任务状态、幂等状态、限流计数等跨请求共享数据；多实例场景必须走 Redis / DB / MQ 幂等
- [ ] **P0：Redis 缓存必须有 TTL**：禁止 `RedisUtil.set()` 或 `opsForValue().set()` 写业务缓存但不设置过期时间
- [ ] **P1：外部调用必须有资源边界**：HTTP / SDK / 文件 IO 必须设置连接超时、读取超时、最大重试次数，并确保响应体 / 流 / 连接被关闭
- [ ] **P1：日志不得打印大对象**：禁止整包打印 callback body、请求体、响应体、DTO、Entity、大 JSON；只打业务 id、长度、摘要、状态
- [ ] **P1：批量处理必须有上限**：分页查询、批量导入、批量 MQ 投递、集合聚合必须说明单批大小和失败恢复方式
- [ ] **P1：幂等与重复消费**：MQ Listener / 第三方 callback 若存在写库、发 MQ、写缓存等副作用，必须有 Redis SETNX、唯一约束、终态判断或去重 key
- [ ] **P1：租户隔离**：涉及查询、更新、删除的业务数据访问必须确认 `companyId` / tenant 条件，Controller 不得信任前端传入的 companyId
- [ ] **P1：SQL 注入风险**：禁止 MyBatis XML / 注解 SQL 使用 `${}` 拼接；`.last()` / `.apply()` 必须使用常量或白名单参数
- [ ] **P1：事务内外部调用**：`@Transactional` 内执行 HTTP / MQ / Redis / SDK 调用时必须说明超时、失败一致性和锁占用风险
- [ ] **P1：异常吞掉**：`catch` 后返回成功、`null` 或空返回必须有失败状态落库、失败通知或明确补偿策略
- [ ] **P1：敏感字段暴露**：VO / Response 禁止包含 password、token、secret、appSecret、idCard、bankCard 等敏感字段

#### Service 职责边界
- [ ] **单一职责**：每个 Service 只负责一个业务领域，命名即职责（`JobConfigService` 管岗位配置，不处理候选人流程）
- [ ] **禁止反向依赖**：低层 Service（如 `AnswerRecordService`）不得注入高层业务聚合 Service（如 `AssessmentFlowService`），依赖关系只能从上往下
- [ ] **允许平行域调用**：同级平行业务 Service 之间可以直接注入调用，但需注意循环依赖（用 `@Lazy` 打破），避免形成环形调用链
- [ ] **入参/出参边界**：Service 方法入参为 DTO 或基础类型，出参为 Entity / VO / 基础类型，**禁止直接传递 HttpServletRequest / HttpSession 等 Web 对象**
- [ ] **禁止跨服务直接 Mapper 复用**：跨微服务的数据需求必须通过 `*-api` Feign 接口或 MQ，不得共享数据库/Mapper

---

### 🟡 第二级：合规（第一级全部通过后执行）

**验证代码分层、工程规范与代码风格，输出「合规结论」。**

#### 分层与归属
- [ ] Entity 只留在 `{service}-service`，未泄漏到 Controller 或 VO
- [ ] VO 只包含前端需要的字段（无 `is_deleted`、密码、内部流转字段）
- [ ] Controller 方法体 ≤ 3 行，无业务逻辑，只做收参、调用、出参转换
- [ ] 无 `@Autowired`，Service 必须用 `@Resource`，Controller 用构造注入（`@RequiredArgsConstructor`）

#### 全局禁令
- [ ] Service 层无 `JSONObject`/`JSONArray`/`JSON.parseObject`
- [ ] 存在性判断用 `.select(id).one() != null`，无 `count() > 0` 或 `.exists()`
- [ ] 查询方法/单写操作无多余 `@Transactional`
- [ ] 无 `@Autowired`，Service 用 `@Resource`，Controller 用构造注入
- [ ] **【绝对禁止】任何 Swagger/OpenAPI 注解及框架**：禁止 `import io.swagger.*`（springfox v2 / springdoc v3）、禁止 `import springfox.*`、禁止 pom.xml 中引入 `springfox`/`swagger-annotations`/`springdoc-openapi` 依赖。YApi 文档由 AI 读取 Controller 源码 + Javadoc 直接生成 OpenAPI JSON，不依赖运行时注解。
- [ ] **【绝对禁止】直接注入 `StringRedisTemplate` / `RedisTemplate`**：Redis 操作统一通过 `RedisUtil` 静态方法；所有缓存必须设置 TTL；违规示例：`@Resource StringRedisTemplate redisTemplate`（见 `java-redis` skill）。
- [ ] **【绝对禁止】POJO 字段使用任何基本类型**：Entity / DTO / VO / Request / Response 的非 `final` 字段禁止 `byte` / `short` / `int` / `long` / `float` / `double` / `boolean` / `char`，必须使用包装类型（金额用 `BigDecimal`）；`final` 字段、`static final` / `final static` 常量如 `serialVersionUID` 豁免；数组字段不纳入本规则。

**第四步：验证复用**
- [ ] 枚举实现 `BaseEnum`，错误码实现 `ErrorCode`（来自 `common-base`）
- [ ] 无自定义 `BizException`、散落 `200/500`、新造 `success()/fail()`

**第五步：验证接口**
- [ ] URL 全小写连字符，名词复数，无动词
- [ ] **路径参数 `{id}` 必须放在路径末尾**，动作词或子资源名作前缀置于参数之前；禁止 `/{id}/update`、`/{id}/status`、`/{id}/candidates` 等将参数嵌入路径中间的写法
- [ ] 出参统一 `Result<XxxVO>`，无裸 Entity/裸 List

**第六步：工程质量**
- [ ] 无无用 import、调试代码（`System.out.println`/`printStackTrace()`）、未使用变量

**第七步：注释审查**
- [ ] 每个类（Controller/Service/Mapper/Entity/Enum/Utils）有类级 Javadoc：说明职责，标注 `@author`、`@since`
- [ ] **所有方法**（`public`/`protected`/`private`）**必须有 Javadoc**：public 方法含参数含义、返回值语义、可能抛出的业务异常（`@throws`）；private 方法至少一行说明意图
- [ ] **所有字段**（类成员变量、枚举常量、`static final` 常量）**必须有注释**：字段注释说明含义、单位、取值范围或关联枚举；枚举类型字段标注 `{@link XxxEnum}`，状态码字段标注 `{@link XxxErrorCode}`
- [ ] **方法内部关键节点必须有步骤注释**：校验、查询、计算、状态变更、发消息等关键步骤前以 `// 1. xxx` 格式标注，逻辑块之间空一行
- [ ] 注释描述**意图（why）**，禁止逐行翻译代码（what）
- [ ] 禁止占位注释（`// TODO`/`// FIXME`/`// 待完善`）遗留到交付版本——必须处理或转 issue
- [ ] 禁止注释掉的死代码块（应直接删除，依赖版本管理追溯）
- [ ] 注释与代码语义一致，代码改了注释同步更新（禁止注释说旧语义）

**注释规范豁免清单（`check-docs.py` 自动识别，不报警）**

| 规则 | 豁免对象 | 豁免理由 |
|------|----------|----------|
| CR-24 | `@Override` / `@Test` 标注的 public 方法 | 已由父类契约 / 测试框架语义自描述 |
| CR-27 | `serialVersionUID` 字段 | JDK `Serializable` 接口约定字段，无业务含义 |
| CR-27 | 仅被 Mockito 注解（`@Mock` / `@InjectMocks` / `@Spy` / `@Captor` / `@MockBean` / `@SpyBean` / `@MockitoBean` / `@MockitoSpyBean`）修饰的字段 | 注解本身已说明字段角色（被 mock 的依赖） |
| CR-27 | 仅被 Spring 注入注解（`@Autowired` / `@Resource`）修饰的字段 | 「类型 + 注入注解」已等价于"被注入的依赖"，再加 Javadoc 属重复信息 |
| CR-27 | 与上述 Mockito / Spring 注解共存的噪音注解（`@SuppressWarnings` / `@Generated`） | 不破坏字段语义，允许与自描述注解叠加而仍享豁免 |
| CR-28 | 测试源码（路径含 `src/test`）下的 `private` / `protected` helper 方法 | 由所属 `@Test` 方法的 `@DisplayName` / 方法名上下文自描述 |

> 自上而下查找 Javadoc 时，脚本可跨过任意条数的注解链（含 `@Xxx(...)` 多行参数），避免长注解链导致的误报；多行注解参数需正确闭合括号才会被识别为同一注解块。

**第八步：日志审查**

*主链路覆盖*
- [ ] 写操作（create/update/remove）在**方法入口**打 `log.info("业务名 - 操作 - 开始: key = {}", val)`，在**完成后**打 `log.info("业务名 - 操作 - 成功: id = {}", id)`
- [ ] **复杂逻辑覆盖**：< 10 行无需日志；10 ～ 30 行须主链路日志 + 关键节点 1 条；30 ～ 100 行须主链路日志 + 关键节点多条 + 每条分支各 1 条
- [ ] 查询方法不打 `log.info`（高频查询禁止打日志）

*方法内部日志*
- [ ] **关键分支**（`if-else`/`switch`）每条走向须有 1 条 `log.info`/`log.debug`，说明走了哪个分支及触发原因
- [ ] **外部调用前后**（Feign / Redis / MQ 发送）须有日志：调用前打入参关键字段，调用成功打结果标识，调用失败在 `catch` 中打 `log.warn/error`
- [ ] **状态变更节点**必须打日志，格式：`"业务名 - 状态变更: id = {}, oldStatus = {}, newStatus = {}"`
- [ ] **幂等/跳过分支**须有 1 条 `log.info`/`log.debug` 说明跳过原因

*格式与规范*
- [ ] **【铁律 · 无任何豁免】所有 `log.info/warn/error/debug` 一律遵守三段式格式**：`"业务名 - 操作 - 操作结果: key = {}, key2 = {}"`；启动初始化、Configuration 类、工具类静态方法、Filter/Listener、异常处理器**全部不豁免**
- [ ] 三段式构成：`业务名` / `操作` / `操作结果` 三段**必须为简洁中文短语**——`业务名` 用领域/模块中文名（如 `网关`、`MQ`、`异步任务`、`雪花ID`、`MybatisPlus`、`日期序列化`）；`操作` 用动作短语（如 `创建`、`初始化JwtDecoder`、`注册CorsFilter`、`发送`、`消费`）；`操作结果` 用 `开始`/`成功`/`失败`/`跳过`/`命中缓存`/`<业务原因短语>`（如 `名称重复`、`状态非法`）
- [ ] **kv 的 key 必须为英文标识符**，且与代码变量名一致（便于 grep 排查），如 `id = {}, orderId = {}`，禁止 `订单号 = {}`
- [ ] `=` **两侧各有一个空格**，多个 kv 用 `, ` 分隔（正：`id = {}`，错：`id={}`/`id ={}`）
- [ ] 每条日志必须携带至少一个业务标识或上下文 kv（`id`/`name`/`code`/`bean`/`order` 等），禁止纯文字描述日志（如不带 kv 的 `log.info("初始化 - 完成 - 成功")` 必须补一个 kv）
- [ ] 日志统一用占位符 `{}`，禁止字符串拼接（`"name=" + name`）
- [ ] 异常日志带上下文 + exception 对象放最后：`log.error("xxx - 操作 - 失败: id = {}", id, e)`
- [ ] 日志**禁止**包含：密码、token、身份证号、手机号、银行卡号等敏感字段
- [ ] 日志**禁止**整包序列化对象（`log.info("xxx - 创建 - 开始: dto = {}", JSON.toJSON(entity))`）——含大字段时打爆日志
- [ ] Mapper/DAO 层不打业务日志，由 Service 层记录
- [ ] 日志级别正确：正常流程 `info`，过程调试用 `debug`，非致命异常 `warn`，需人工介入 `error`

**第九步：代码风格**（完整约定见 [CODE_STYLE](references/CODE_STYLE.md)）
- [ ] 命名：类 `UpperCamelCase`，方法/变量 `lowerCamelCase`，常量 `ALL_UPPER_CASE`；无拼音、无不规范缩写；POJO 字段禁止任何基本类型，`boolean isXxx` 必须改为 `Boolean isXxx` 或重新命名（见 `java-pojo` PO-07）
- [ ] **方法体行数**：超过 30 行须提取私有方法；**禁止超过 100 行**（硬性上限，超出必须拆分，否则阻断提交）
- [ ] **防御性编程（卫语句）**：前置条件不满足时应提前 `return` / `throw`，禁止将主流程嵌套在深层 `if-else` 中
- [ ] 大括号不省略，`switch` 必须有 `default`
- [ ] 领域边界：本域操作用 Mapper，跨域调用用 Service，跨服务只依赖 `*-api`
- [ ] 禁止平行协议：无 `BizException`/`BizCode`/散落 `200`/`500`/自定义 `success()/fail()`

---

## 操作附录

高频问题示例、常见边界情况、12 条脚本清单和格式化引擎说明，统一见 [REVIEW_OPERATION.md](references/REVIEW_OPERATION.md)。

---
