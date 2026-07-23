---
name: java-service
description: >-
  规范 Java 微服务 Service 层的业务逻辑编写、单表操作写法与 MapStruct 对象转换方式，明确事务使用边界、依赖注入规则、重复查询逻辑的私有方法抽离原则与超大 Service 的业务链拆分流程。
  涵盖：Service 接口定义、ServiceImpl 实现、@Resource 依赖注入、@Transactional 使用边界、单表查询/更新写法（lambdaQuery/lambdaUpdate）、重复表操作抽离为 private 方法、Service 层禁止 JSON 操作、Convert 接口写法、超大 Service 拆分（业务链梳理 + 行数统计 + 拆分方案选型 + 执行步骤）。
  适用于：编写 Service、ServiceImpl、业务逻辑、单表操作、lambdaQuery、lambdaUpdate、私有方法抽离、查询复用、MapStruct Convert、对象转换、@Transactional 事务、@Resource 注入、服务接口定义、Service 文件过大、God Service、拆分超大 Service、业务链梳理、Service 重构。
compatibility: Java 17+, Spring Boot 3+, MyBatis-Plus 3+, MapStruct 1.5+
metadata:
  domain: java-microservice
  layer: service
---

# Service 层 & Convert 规范

## 使用前置

进入本 skill 前，先过一次 `agent-guardrails`：

- 需求不清、边界不明、存在两种以上合理实现时，先澄清
- 能在原方法或现有对象上小改时，不强行补整套新抽象
- 只在确有必要时扩到 Controller / Mapper / DTO / 测试
- 动手前先想好验证方式

---

## ServiceImpl 两种类型

| 类型 | 继承 | 适用场景 |
|------|------|---------|
| **单表 Service** | `extends ServiceImpl<XxxMapper, XxxEntity>` | 直接对应一张表，CRUD 为主 |
| **业务聚合 Service** | 不继承，仅 `implements XxxService` | 跨多表/多服务编排，无直接对应实体 |

> **判断依据**：若该 Service 的核心职责是操作某一张表，选单表型；若是协调多个子 Service 完成复杂业务流程（如 `ReportService`、`AssessmentFlowService`），选业务聚合型，不强制继承 `ServiceImpl`。

### 接口签名铁律：包装类型，禁基本类型

Service 接口方法的入参与返回值一律用 `Long` / `Integer` / `Boolean`（金额 `BigDecimal`），**禁止 `long` / `int` / `boolean`**：

```java
// ✅ 正确
Long create(JobConfigDTO dto);
Boolean existsByName(String name);
Integer countActive(Long companyId);

// ❌ 错误：调用方拿 boolean false 无法区分"不存在"与"接口异常默认值"，
//    @Transactional 异常回滚后基本类型仍可能返回默认 0/false
long create(JobConfigDTO dto);
boolean existsByName(String name);
```

与 [`java-pojo`](../java-pojo/SKILL.md) PO-07 / [`java-mapper`](../java-mapper/SKILL.md) 返回类型铁律 / [`java-controller`](../java-controller/SKILL.md) 入参铁律对齐。

---

## 步骤：编写一个标准 Service 方法

以 `create` 方法为例：

```java
// 1. Service 接口（放 {service}-api 或 {service}-service）
public interface JobConfigService {
    Long create(JobConfigDTO dto);
}

// 2a. 单表 ServiceImpl：继承 ServiceImpl<Mapper, Entity>
@Slf4j
@Service
public class JobConfigServiceImpl
        extends ServiceImpl<JobConfigMapper, JobConfigEntity>
        implements JobConfigService {

    @Resource                           // ✅ @Resource，禁止 @RequiredArgsConstructor
    private JobConfigConvert jobConfigConvert;

    @Override
    public Long create(JobConfigDTO dto) {          // 单写操作，不加事务
        log.info("岗位配置 - 创建 - 开始: name = {}", dto.getName());

        // 唯一性校验：同名岗位配置不允许重复，重复时快速失败
        if (existsByName(dto.getName())) {
            log.warn("岗位配置 - 创建 - 名称重复: name = {}", dto.getName());
            throw JobConfigErrorCode.JOB_CONFIG_NAME_DUPLICATED.toEx();
        }

        JobConfigEntity entity = jobConfigConvert.toEntity(dto);
        this.save(entity);

        log.info("岗位配置 - 创建 - 成功: id = {}", entity.getId());
        return entity.getId();
    }
}

// 2b. 业务聚合 ServiceImpl：不继承 ServiceImpl，仅实现接口
@Slf4j
@Service
public class ReportServiceImpl implements ReportService {

    @Resource
    private AssessmentFlowService assessmentFlowService;

    @Resource
    private AnswerRecordService answerRecordService;

    @Override
    public ReportVO getCandidateReport(Long candidateId) {
        // 跨多个子 Service 聚合数据，本类不直接操作 Mapper
        AssessmentFlowEntity flow = assessmentFlowService.findLatestFlow(candidateId);
        List<AnswerRecordEntity> records = answerRecordService.listByFlowId(flow.getId());
        // ...
    }
}
```

---

## 事务使用边界（重点）

| 方法类型 | `@Transactional` | 说明 |
|----------|-----------------|------|
| 纯查询方法 | **不加** | 只读，无需事务 |
| 单个写操作 | **不加** | 单操作原子性由数据库保证 |
| 多个写操作 | **加** `rollbackFor = Exception.class` | 保证多写原子性 |
| 单写 + 缓存/MQ/HTTP 等外部操作 | **加** `rollbackFor = Exception.class` | 写库失败需回滚，防止外部操作与 DB 不一致 |

> **原则**：当且仅当 **多写** 或 **单写 + 外部操作**（缓存、MQ、HTTP 调用）时才加事务。

```java
// ✅ 多写：保证两个写操作的原子性
@Transactional(rollbackFor = Exception.class)
public void transferJob(Long fromId, Long toId) {
    jobService.close(fromId);    // 写操作 1
    jobService.activate(toId);   // 写操作 2
}

// ✅ 单写 + MQ：写库失败需回滚，防止消息已发但 DB 未写入
@Transactional(rollbackFor = Exception.class)
public Long publish(JobConfigDTO dto) {
    JobConfigEntity entity = jobConfigConvert.toEntity(dto);
    this.save(entity);
    // 发送招聘发布消息，触发后续流程异步处理
    RocketMqUtil.send(MqConst.TOPIC_JOB_PUBLISHED, new JobPublishedMessage(entity.getId()));
    return entity.getId();
}

// ❌ 单写：禁止加事务，数据库自身保证原子性
@Transactional  // ← 多余
public Long create(JobConfigDTO dto) { ... }

// ❌ 单查询：禁止加事务
@Transactional  // ← 多余
public JobConfigDTO getById(Long id) { ... }
```

---

## 防御性编程（卫语句 / 早返回）

> **原则**：前置条件不满足时，尽早 `return` / `throw`，将主流程逻辑保持在最浅的缩进层级。

### ✅ 正例：卫语句展开，主逻辑清晰

```java
public void approve(Long id) {
    // 存在性前置校验：记录不存在时提前抛出，避免后续无效操作
    XxxEntity entity = findByIdOrThrow(id);

    // 状态前置校验：只有「待审批」状态才允许审批，其他状态快速失败
    if (!XxxStatusEnum.PENDING.getCode().equals(entity.getStatus())) {
        log.warn("xxx - 审批 - 状态非法: id = {}, status = {}", id, entity.getStatus());
        throw XxxErrorCode.XXX_STATUS_INVALID.toEx();
    }

    // 主流程：条件全部满足后，集中处理业务逻辑
    entity.setStatus(XxxStatusEnum.APPROVED.getCode());
    this.updateById(entity);
}
```

### ❌ 反例：嵌套 if-else，主逻辑被淹没

```java
public void approve(Long id) {
    // ❌ 禁止：直接调用 baseMapper / getOne(new LambdaQueryWrapper<>...)，应用 findByIdOrThrow 或 lambdaQuery() 链式写法
    XxxEntity entity = baseMapper.selectById(id);
    if (entity != null) {
        if (XxxStatusEnum.PENDING.getCode().equals(entity.getStatus())) {
            entity.setStatus(XxxStatusEnum.APPROVED.getCode());
            this.updateById(entity);
        } else {
            throw XxxErrorCode.XXX_STATUS_INVALID.toEx();
        }
    } else {
        throw XxxErrorCode.XXX_NOT_FOUND.toEx();
    }
}
```

### 卫语句适用场景

| 场景 | 处理 |
|------|------|
| 参数为空 / 列表为空 | 直接 `return` 或 `return Collections.emptyList()` |
| 记录不存在 | 调用 `findByIdOrThrow`，让 NOT_FOUND 在入口暴露 |
| 状态不合法 | 校验通过后再执行写操作，状态非法立即 `throw` |
| 条件不满足时跳过 | 单独提前 `return`，不与主流程混在 `else` 中 |
| 唯一性冲突 | 在写操作之前校验，重复时立即 `throw` |

```java
// ✅ 列表为空时早返回，避免空循环
public void batchProcess(List<Long> ids) {
    // 入参保护：ids 为空时直接返回，避免无意义的后续查询
    if (CollUtil.isEmpty(ids)) {
        return;
    }
    // 主流程逻辑...
}
```

---

## 表操作私有方法抽离（重点）

> **原则**：同一条件的查询/校验逻辑若在多个公共方法中重复出现，必须抽离为 `private` 方法，禁止内联散落。

### 判断标准

| 情况 | 处理 |
|------|------|
| 同一查询条件在 ≥ 2 处出现 | 抽离为 `private` 查询方法 |
| 存在性 / 唯一性校验在 ≥ 2 处出现 | 抽离为 `private boolean existsBy...()` |
| 按 ID 查并抛异常在 ≥ 2 处出现 | 抽离为 `private XxxEntity findByIdOrThrow(Long id)` |
| 构建动态 Wrapper 条件在 ≥ 2 处出现 | 抽离为 `private LambdaQueryWrapper<XxxEntity> buildXxxWrapper(...)` |

### ✅ 正例：抽离复用

```java
// 多个公共方法都需要"按编码查记录"→ 抽成私有方法
public void activate(String code) {
    XxxEntity entity = findByCodeOrThrow(code);
    // ...
}

public void deactivate(String code) {
    XxxEntity entity = findByCodeOrThrow(code);
    // ...
}

// ✅ 私有方法：查询 + 存在性校验收拢到一处
private XxxEntity findByCodeOrThrow(String code) {
    XxxEntity entity = lambdaQuery()
            .eq(XxxEntity::getCode, code)
            .one();
    if (entity == null) {
        throw XxxErrorCode.XXX_NOT_FOUND.toEx();
    }
    return entity;
}

// ✅ 私有方法：唯一性校验
private boolean existsByName(String name) {
    return lambdaQuery()
            .select(XxxEntity::getId)
            .eq(XxxEntity::getName, name)
            .one() != null;
}
```

### ❌ 反例：查询逻辑内联重复

```java
// ❌ 同一查询写了两遍，条件变更时需改多处
public void activate(String code) {
    XxxEntity entity = lambdaQuery().eq(XxxEntity::getCode, code).one();
    if (entity == null) { throw XxxErrorCode.XXX_NOT_FOUND.toEx(); }
    // ...
}

public void deactivate(String code) {
    XxxEntity entity = lambdaQuery().eq(XxxEntity::getCode, code).one();  // 重复
    if (entity == null) { throw XxxErrorCode.XXX_NOT_FOUND.toEx(); }
    // ...
}
```

---

## 拆分超大 Service（重点）

> **背景**：单个 ServiceImpl 持续增长后会出现“God Service”——文件几千行、方法职责混杂、改一处影响一片。出现以下任一信号即触发拆分流程：
>
> - ServiceImpl 行数 **≥ 800 行**
> - 公共方法数 **≥ 20 个**
> - 同一类中明显存在 ≥ 2 条互不依赖的业务链（如「岗位配置 CRUD」+「岗位发布流程」+「岗位统计报表」混在一个 `JobService`）
> - Git 历史中该文件长期处于团队冲突 Top N

### 拆分三步法

#### 第 1 步：业务链梳理 + 行数统计

**目标**：以「业务链」为单位盘点现状，用数据说话，不靠感觉。

操作清单：

1. 列出该 Service 全部 `public` 方法（含接口与实现）
2. 按业务链归类（同一实体的 CRUD / 同一流程的多步操作 / 同一报表的聚合 视为一条链）
3. 统计每条链的方法数、累计行数（含私有辅助方法）、依赖的 Mapper / 外部 Service
4. 输出统计表，作为后续拆分方案的事实依据

```text
JobServiceImpl 现状梳理（共 1240 行 / 27 个公共方法）

| 业务链         | 方法数 | 累计行数 | 依赖                        |
|---------------|-------|---------|-----------------------------|
| 岗位配置 CRUD  |   8   |   220   | JobMapper                   |
| 岗位发布流程   |   6   |   480   | JobMapper, MQ, AuditService |
| 岗位统计报表   |   5   |   310   | JobMapper, ReportMapper     |
| 岗位状态机     |   4   |   150   | JobMapper                   |
| 通用查询/工具   |   4   |    80   | JobMapper                   |
```

> **禁止**：跳过统计直接拆。没有数据支撑的“感觉太大了”往往拆出更糟的结构。

#### 第 2 步：基于统计提出方案，挑最优解

> **优先级原则**：能不拆则不拆 → 单文件抽 private/Helper → 同名拆子 Service → 跨域独立 Service。

候选方案模式（按由轻到重排列）：

| 方案 | 触发条件 | 命名示例 | 适用场景 |
|------|---------|---------|---------|
| **A. 不拆，仅抽 private** | 链内重复逻辑多，链间耦合低 | `JobServiceImpl` 内抽 `private validateXxx()` / `private buildWrapper()` | 单链 ≤ 200 行，仅有局部重复 |
| **B. 同名分子 Service** | 主链 + 多条强依赖子链 | `JobService` + `JobPublishService` + `JobStatService`（同 `job` 包） | 子链对外有独立入口，但仍属于「岗位」域 |
| **C. 抽工具 / 状态机 Helper** | 大量纯函数 / 状态流转逻辑 | `JobStatusHelper`、`JobScoreCalculator` | 无副作用、易单测、与 Spring 无关 |
| **D. 独立子域 Service** | 已构成独立业务概念，复用面广 | `JobConfigService` ←→ `JobPublishFlowService`（同包但完全独立） | 链间几乎不互调，可独立演进 |
| **E. 跨服务下沉到 api 层** | 该子链被其他微服务调用 | 将 Feign 接口下沉到 `xxx-api` 模块 | 已突破当前微服务边界 |

**选型决策表**（按统计结果套用）：

| 单条链行数 | 链间耦合 | 推荐方案 |
|-----------|---------|---------|
| < 200      | 任意    | A（保持原样 + 抽 private） |
| 200 ~ 500  | 高      | A 或 B |
| 200 ~ 500  | 低      | B 或 D |
| ≥ 500      | 高      | B（必拆） |
| ≥ 500      | 低      | D（必拆） |
| 纯计算逻辑  | —       | C |

> **必须**：方案中明确给出「拆后每个 Service 的名称、职责一句话、迁移的方法清单、迁移后行数预估」，并与原统计表对照，确认每条链都有归属。

#### 第 3 步：执行拆分

操作顺序（每步独立可回滚）：

1. **新建空 Service 接口与实现**：先按方案命名建好骨架，包路径与原 Service 同包
2. **迁移方法（按业务链整链迁移）**：一次只迁一条链，迁完编译通过即提交
3. **迁移调用方**：替换 Controller / 其他 Service 的注入与调用点
4. **迁移单元测试**：测试类按新 Service 拆分；不要把多个新 Service 的测试堆在原测试类里
5. **删除原方法 + 收尾**：原 Service 仅保留主链；空文件必须删除
6. **复跑校验脚本**：执行本 skill 末尾的校验脚本（`check-service.sh` / `check-service-advanced.py` / `check-transaction-boundary.py`）

```text
✅ 拆分后产物示例（基于上面的 JobServiceImpl）

job/
├── JobService / JobServiceImpl                    （岗位配置 CRUD + 状态机，约 370 行）
├── JobPublishService / JobPublishServiceImpl      （发布流程，约 480 行）
├── JobStatService / JobStatServiceImpl            （统计报表，约 310 行）
└── helper/
    └── JobStatusHelper                            （状态流转纯函数，约 80 行）
```

### 拆分铁律

- **统计先行**：未输出业务链统计表，不允许进入拆分实施
- **整链迁移**：一次 PR 只迁一条业务链，禁止跨链交叉迁移
- **不破坏对外契约**：原 Service 接口签名保持兼容（如对外暴露的 Feign 接口），先内部拆，再决定是否拆接口
- **禁止"为拆而拆"**：方案 A（不拆）永远是默认选项，统计数据未达阈值时直接选 A
- **测试同步迁移**：拆 Service 必拆测试类，测试类与 Service 一一对应
- **拆完即审**：拆分完成后必须过一遍 `java-code-review` skill，重点检查分层正确性与命名

---

## Convert 写法

```java
@Mapper(componentModel = "spring")
public interface JobConfigConvert {
    JobConfigDTO toDTO(JobConfigEntity entity);
    JobConfigEntity toEntity(JobConfigDTO dto);

    @Mapping(target = "typeDesc", expression = "java(entity.getType() != null ? JobTypeEnum.getByCode(entity.getType()).getDesc() : null)")
    JobConfigVO toVO(JobConfigEntity entity);

    void copyToEntity(JobConfigDTO dto, @MappingTarget JobConfigEntity entity);
}
```

- `copyToEntity`：只修改业务字段，保留 `id`/`createdAt` 等审计字段
- 禁止在 Convert 中写业务逻辑（条件判断、数据库查询）

---

## 日志 / 注释 / Redis Key 规范

> 以下规范的权威来源为对应专属 skill，Service 层开发时须遵守，审查时以原始定义为准。

| 规范 | 权威来源 |
|------|----------|
| 日志格式、级别、覆盖要求 | **java-code-review** skill → `references/HIGH_FREQ_ISSUES.md`、`references/CODE_STYLE.md` |
| 关键节点注释 | **java-code-review** skill → 第一级严查 → 注释审查 |
| Redis Key 命名、CacheConst、禁止拼接 | **java-redis** skill |

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 同一查询/校验逻辑在多处重复 | 抽离为 `private` 方法（`findByXxxOrThrow`、`existsByXxx`、`buildXxxWrapper`）；禁止内联散落 |
| 单条查询写法 | 统一用 `lambdaQuery().eq(...).one()` 或 `findByIdOrThrow(id)`；严禁 `getOne(new LambdaQueryWrapper<>...)` 裸传 Wrapper |
| Service 之间互相依赖，导致循环依赖 | `@Resource` 字段注入可解决；禁止用 `@RequiredArgsConstructor` |
| 方法中需要处理 JSON 字段 | 定义对应 DTO 类，通过 Convert 完成转换；禁止在 Service 中直接解析 JSON 字符串 |
| 查询方法也想加 `@Transactional` 防脏读 | 加 `@Transactional(readOnly = true)`，但大多数场景不必要 |
| 跨 Service 调用需要在同一事务 | 在上层 Service 方法加事务，下层不加；禁止嵌套事务 |
| Convert 字段名不一致（驼峰↔下划线） | 使用 `@Mapping(source = "xxx", target = "yyy")` 显式映射 |
|| 该 Service 是否必须继承 `ServiceImpl` | 直接操作单张表 → 继承；跨多表/多服务编排的业务聚合类 → 不继承，仅 `implements XxxService` |
|| Service 文件越来越大、想要拆分 | 按「拆分超大 Service」三步法：① 业务链梳理 + 行数统计 → ② 选型决策表挑方案 → ③ 整链迁移 + 同步迁测试，禁止跳过统计直接拆 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [XxxService.java](references/XxxService.java) | Service 接口模版 |
| [XxxServiceImpl.java](references/XxxServiceImpl.java) | ServiceImpl 模版 |
| [XxxConvert.java](references/XxxConvert.java) | MapStruct Convert 模版 |
| [README](references/README.md) | 整体说明 |

**示例**：[UserService.java](assets/UserService.java) · [UserServiceImpl.java](assets/UserServiceImpl.java) · [UserConvert.java](assets/UserConvert.java)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# Service 层规范（禁注入他域 Mapper / 禁 JSON / 事务边界 / baseMapper 裸调用）
bash ~/cursor/skills/java-service/scripts/check-service.sh <模块路径>

# Service 高级检查（重复 lambdaQuery 条件 / Convert 含业务逻辑）
python3 ~/cursor/skills/java-service/scripts/check-service-advanced.py <模块路径>

# 事务边界检查（多写操作缺 @Transactional / DB 写 + MQ 发送缺事务）
python3 ~/cursor/skills/java-service/scripts/check-transaction-boundary.py <模块路径>

# Convert 接口规范（@Mapper 注解 / 禁注入 Bean / 禁手动 setter 复制对象）
bash ~/cursor/skills/java-service/scripts/check-convert.sh <模块路径>

# 自动生成缺失的 MapStruct Convert 接口
python3 ~/cursor/skills/java-service/scripts/generate-convert.py <service模块路径> [--domain 域名] [--dry-run]
# 示例：
python3 ~/cursor/skills/java-service/scripts/generate-convert.py ./assess-service --domain Question --dry-run
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
