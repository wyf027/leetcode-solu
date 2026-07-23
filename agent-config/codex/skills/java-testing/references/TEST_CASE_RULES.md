# 测试用例规范

**何时使用**：开发任何功能点之前必读，测试用例是开发的起点，不是终点。

## 专项指南

| 文件 | 主题 |
|------|------|
| [IDEMPOTENT_TEST_GUIDE.md](IDEMPOTENT_TEST_GUIDE.md) | 幂等场景覆盖（`[IDEM-xx]` 用例、三种实现模式、测试骨架） |
| [CONCURRENT_TEST_GUIDE.md](CONCURRENT_TEST_GUIDE.md) | 并发场景覆盖（`[CONC-xx]` 用例、CountDownLatch / Mock 骨架） |
| [PERF_TEST_GUIDE.md](PERF_TEST_GUIDE.md) | 性能场景覆盖（`[PERF-xx]` 用例、入参防护、N+1 检测、响应时间基线） |
| [MYBATIS_PLUS_TEST_PITFALLS.md](MYBATIS_PLUS_TEST_PITFALLS.md) | MyBatis-Plus @Spy 测试陷阱（baseMapper 注入失败、lambdaQuery NPE、Mockito 4.x Map 默认值） |

---

## 一、核心原则

**【强制】所有功能开发必须遵循以下顺序：**

```
理解需求 → 定义测试用例 → 实现代码 → 所有用例通过
```

- 测试用例描述**业务行为**，与代码层级（Controller / Service / Mapper）无关
- 用例先于实现存在，是需求的可执行描述
- 禁止先写实现，再补测试

**【严禁】因测试用例注入问题导致失败时，禁止变更业务层代码。**

测试失败的根因决定修复方向：

| 失败根因 | 修复方向 |
|---------|---------|
| `@Mock` / `@InjectMocks` 配置错误 | 修复测试类的注解与依赖声明 |
| `when(...).thenReturn(...)` 桩配置遗漏或错误 | 补充或修正 Mock 桩 |
| `@BeforeEach` Fixture 未正确初始化 | 修复测试数据准备逻辑 |
| Spring 上下文未加载导致 `NullPointerException` | 补充 `@ExtendWith` / `@SpringBootTest` 等测试基础设施 |
| 业务逻辑本身存在缺陷 | 修复业务代码（唯一允许修改业务层的情形） |

> 注入问题是**测试基础设施的缺陷**，绝不是业务代码需要配合测试而改变的理由。
> 若为了让测试通过而在业务类中添加无业务含义的构造器、setter 或可见性变更，视为违规。

---

## 二、什么是测试用例

一条测试用例回答：**给定什么前提条件，执行什么操作，期望得到什么结果。**

```
功能：发布职位

[TC-01] 给定草稿状态的职位，执行发布 → 职位状态变为"已发布"
[TC-02] 给定职位描述恰好 5000 字（上限），执行发布 → 成功
[TC-03] 给定不存在的职位 ID，执行发布 → JOB_NOT_FOUND
[TC-04] 给定已发布状态的职位，执行发布 → JOB_STATUS_NOT_ALLOW
[TC-05] 给定已关闭状态的职位，执行发布 → JOB_STATUS_NOT_ALLOW
[TC-06] 未传职位 ID → 参数校验失败
```

---

## 三、场景覆盖维度

每个功能点至少覆盖以下维度，按"正常 → 边界 → 异常"顺序列出：

| 维度 | 说明 |
|------|------|
| **正常场景** | 合法输入，期望的业务结果 |
| **边界场景** | 极值、空集合、最大/最小值、恰好满足条件 |
| **非法入参** | 缺少必填项、类型错误、格式不合法 |
| **业务异常** | 资源不存在、前置条件不满足、状态不允许操作 |
| **状态流转** | 每条合法流转路径 + 每条非法流转路径均有用例 |
| **幂等场景** | 同一操作重复执行 N 次，结果与执行 1 次等价（详见 [IDEMPOTENT_TEST_GUIDE](IDEMPOTENT_TEST_GUIDE.md)） |
| **并发场景** | 多线程同时执行时的竞态结果（详见 [CONCURRENT_TEST_GUIDE](CONCURRENT_TEST_GUIDE.md)） |
| **性能场景** | 入参上限保护、N+1 查询、全表保护、批量分批；响应时间基线（详见 [PERF_TEST_GUIDE](PERF_TEST_GUIDE.md)） |

---

## 四、用例记录格式

用 `[TC-xx]` 编号，格式为：**前提条件 → 期望结果**，记录在功能对应的 Javadoc 中。

```java
/**
 * 发布职位
 *
 * <p>测试用例：
 * <pre>
 * [TC-01] 草稿职位 → 发布成功，状态变为 PUBLISHED
 * [TC-02] 职位描述 5000 字（上限） → 发布成功
 * [TC-03] 职位不存在 → JOB_NOT_FOUND
 * [TC-04] 已发布状态 → JOB_STATUS_NOT_ALLOW
 * [TC-05] 已关闭状态 → JOB_STATUS_NOT_ALLOW
 * [TC-06] 未传 id → 参数校验失败
 * </pre>
 */
```

**记录位置**：功能的入口方法 Javadoc（Controller 方法 或 Service 方法，取决于功能的对外暴露形式）。

---

## 五、业务链路闭环测试

### 什么是业务链路闭环测试

单个功能点测试只验证一个操作的正确性，**链路闭环测试**验证多个操作串联后整个业务流程端到端的正确性。

**【强制】每个业务模块至少定义一条主链路闭环用例**，覆盖从业务起点到终点的完整流转。

---

### 链路用例格式

链路用例用 `[FLOW-xx]` 编号，描述操作序列及每步期望状态：

```
[FLOW-01] 职位完整生命周期

步骤 1：创建职位（草稿）         → 职位存在，状态 DRAFT
步骤 2：编辑职位描述             → 职位描述已更新
步骤 3：发布职位                 → 状态变为 PUBLISHED，招聘中
步骤 4：候选人投递简历           → 简历存在，状态 PENDING
步骤 5：简历进入面试             → 简历状态 INTERVIEWING
步骤 6：面试通过，发放 Offer     → Offer 状态 SENT
步骤 7：候选人接受 Offer         → Offer 状态 ACCEPTED，职位录用数 +1
步骤 8：关闭职位                 → 状态变为 CLOSED，不再接受投递
```

---

### 链路用例记录位置

链路用例记录在业务模块的入口类（通常是主 Controller）的类级 Javadoc 中：

```java
/**
 * 职位管理
 *
 * <p>业务链路闭环测试：
 * <pre>
 * [FLOW-01] 职位完整生命周期
 *   1. 创建职位（草稿）         → 状态 DRAFT
 *   2. 发布职位                 → 状态 PUBLISHED
 *   3. 候选人投递简历           → 简历状态 PENDING
 *   4. 简历进入面试             → 简历状态 INTERVIEWING
 *   5. 发放并接受 Offer         → Offer 状态 ACCEPTED
 *   6. 关闭职位                 → 状态 CLOSED
 *
 * [FLOW-02] 职位发布后直接关闭（无投递）
 *   1. 创建职位                 → 状态 DRAFT
 *   2. 发布职位                 → 状态 PUBLISHED
 *   3. 关闭职位                 → 状态 CLOSED，历史投递不受影响
 * </pre>
 */
@RestController
@RequestMapping("/jobs")
public class JobController { ... }
```

---

### 链路用例设计原则

| 原则 | 说明 |
|------|------|
| **主链路必选** | 业务最常走的"幸福路径"必须有对应 FLOW 用例 |
| **分支链路按需补充** | 重要的分支流程（拒绝、撤回、异常中断等）单独建 FLOW 用例 |
| **每步有期望状态** | 链路每个步骤都记录执行后的期望数据状态，不能只写操作 |
| **跨模块明确边界** | 若链路跨多个服务，标注每步由哪个服务负责 |

---

## 六、单元测试模版

每个功能点对应的代码，均需按所属层级选用对应模版编写单元测试。

| 层级 | 模版文件 | 测试框架 | 说明 |
|------|----------|----------|------|
| Controller（Web 层） | [XxxControllerTest.java](XxxControllerTest.java) | `@WebMvcTest` + MockMvc + `@MockBean` | 验证 HTTP 协议映射、参数校验、出参结构；Service 全部 Mock |
| Service 实现层 | [XxxServiceImplTest.java](XxxServiceImplTest.java) | `@ExtendWith(MockitoExtension)` + `@InjectMocks` + `@Mock` | 验证业务逻辑、状态流转、异常抛出；Mapper/Convert 全部 Mock |
| 工具类 | [XxxUtilsTest.java](XxxUtilsTest.java) | 纯 JUnit5 | 验证每个静态方法的边界输入输出；无需 Spring 容器，直接调用 |
| Handler（处理器） | [XxxHandlerTest.java](XxxHandlerTest.java) | `@ExtendWith(MockitoExtension)` + `@Mock` | 验证 support() 匹配条件、handle() 正常/异常路径；依赖全部 Mock |
| Listener（MQ 消费） | [XxxListenerTest.java](XxxListenerTest.java) | `@ExtendWith(MockitoExtension)` + `@Mock` | 验证消费逻辑：合法消息、字段缺失快速失败、Service 异常传播、幂等跳过 |
| 集成测试（真实 DB） | [XxxIntegrationTest.java](XxxIntegrationTest.java) | `@SpringBootTest` + `@Transactional` | 验证 SQL/查询条件/DB 约束；@BeforeEach 写入 Fixture，@Transactional 每次自动回滚 |
| **并发测试** | [XxxConcurrentTest.java](XxxConcurrentTest.java) | `@ExtendWith(MockitoExtension)` + `CountDownLatch` / `@SpringBootTest`（集成） | 验证先查后写竞态、幂等性、计数器并发、状态竞态 |

### 各层测试覆盖要求

| 层级 | 必须覆盖 |
|------|----------|
| Controller | 正常返回结构（`$.code=0`）、必填校验（400）、业务异常码透传 |
| Service | 正常路径、资源不存在抛异常、重复/冲突抛异常、不执行多余 DB 操作（`verify never`） |
| Utils | null/空/边界值/正常值；有异常分支的方法必须覆盖异常断言 |
| Handler | `support()` 匹配与不匹配、`handle()` 正常路径、前置条件失败、null 上下文快速失败 |
| Listener | 合法消息正常消费、关键字段为空快速失败、null 消息快速失败、Service 异常向上传播（禁止吞异常）、重复消息幂等跳过 |
| 集成测试 | getById 数据一致、create 后可查询、update 后字段变更、remove 后查询抛 NOT_FOUND、code 重复抛异常 |
| **并发测试** | 先查后写场景无未处理异常、串行幂等调用结果一致、计数器并发无丢失更新 |

---

## 七、测试数据准备规则

**【强制】测试数据必须自给自足，禁止依赖数据库预置数据。**

预置数据因环境、执行顺序、并发不同而随时变化，是测试不稳定的根源。

### 单元测试（Mock，无真实 DB）

| 规则 | 说明 |
|------|------|
| **Fixture 统一在 `@BeforeEach` 初始化** | 公共对象在 `setUp()` 中构建，每个测试方法获得独立副本 |
| **通过 `build*()` 方法构建完整合法对象** | 返回满足所有校验约束的对象，是测试类唯一数据来源 |
| **非法数据通过定向破坏生成** | 在测试方法内对 Fixture 对象 `setXxx(null)` 破坏指定字段，禁止在测试方法内新建散落对象 |
| **`reset()` 确保 Mock 间无状态泄漏** | Controller 测试 `@BeforeEach` 中调用 `reset(mockBean1, mockBean2)` |
| **`MockitoExtension` 保证 Mock 全新** | `@ExtendWith(MockitoExtension.class)` 每次测试前自动重建 `@Mock` 实例 |

```java
// 正例：定向破坏生成非法数据
@BeforeEach
void setUp() {
    validDTO = buildCreateDTO(); // 完整合法对象
}

@Test
void create_missingName_returns400() {
    validDTO.setName(null); // 定向破坏，仅改需要测的字段
    // ... 执行断言
}

// 反例：测试方法内新建散落对象
@Test
void create_missingName_returns400() {
    XxxCreateDTO dto = new XxxCreateDTO(); // ← 禁止，遗漏其他字段导致测试因校验失败而误报
    // ...
}
```

### 集成测试（真实 DB）

| 策略 | 使用场景 | 模版 |
|------|----------|------|
| **`@Transactional` 自动回滚**（推荐） | 大多数场景，每次测试后 DB 自动还原 | `XxxIntegrationTest` 默认策略 |
| **`@BeforeEach` 手动清理** | 需要测试事务提交行为（`@Transactional` 会干扰）时 | 测试前 `deleteAll()` 再 insert Fixture |
| **`@Sql` 脚本** | 需要精确控制数据集（多表关联等复杂场景）时 | `@Sql("classpath:sql/xxx_fixture.sql")` |

```java
// 正例：集成测试标准数据准备
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class XxxIntegrationTest {

    @BeforeEach
    void setUp() {
        XxxEntity fixture = buildFixtureEntity();
        xxxMapper.insert(fixture);
        savedId = fixture.getId();
    }

    private XxxEntity buildFixtureEntity() {
        XxxEntity e = new XxxEntity();
        e.setName("集成测试名称");
        e.setCode("IT_CODE_001");
        e.setStatus(1);
        return e;
    }
}

// 反例：依赖数据库已有数据
@Test
void getById_ok() {
    XxxDTO result = xxxService.getById(1L); // ← 禁止，ID=1 的数据可能不存在或已变更
}
```

---

## 八、边界值检查清单

开发前逐项确认，所有边界均有对应用例：

| 数据类型 | 必须覆盖的边界 |
|------|------|
| 分页 | pageNum=1、pageSize=1、pageSize=100（上限）、pageSize=101（超限） |
| 字符串 | 空字符串、最大长度恰好满足、超出最大长度 |
| 数值 | 0、负数、最小合法值、最大合法值、超出上限 |
| 集合 | 空列表、单元素、最大批量数恰好满足、超出最大批量数 |
| ID | 不存在的 ID、已软删除的 ID |
| 枚举 | 每个合法值、非法值（如传 99） |
| 状态流转 | 每条合法路径 + 每条非法路径 |

---

## 九、审查清单

- [ ] 编写代码前，已列出所有 `[TC-xx]` 用例
- [ ] 覆盖：正常场景、边界场景、非法入参、业务异常、状态流转
- [ ] 用例已记录在对应功能入口的 Javadoc 中
- [ ] **业务模块主 Controller 类 Javadoc 中至少有一条 `[FLOW-xx]` 链路闭环用例**
- [ ] 链路用例每个步骤均描述了期望的数据状态
- [ ] 测试数据通过 `@BeforeEach` + `build*()` Fixture 方法准备，禁止依赖数据库预置数据
- [ ] **测试失败时已确认根因：若为注入 / Mock / Fixture 问题，只修复测试层，严禁变更业务层代码**
- [ ] 集成测试使用 `@Transactional` / 手动清理 / `@Sql` 三选一，确保每次测试 DB 状态干净
- [ ] **识别幂等风险场景，补充 `[IDEM-xx]` 用例**（详见 [IDEMPOTENT_TEST_GUIDE](IDEMPOTENT_TEST_GUIDE.md)）
- [ ] **识别并发风险模式，补充 `[CONC-xx]` 用例**（详见 [CONCURRENT_TEST_GUIDE](CONCURRENT_TEST_GUIDE.md)）
- [ ] **识别性能风险点，补充 `[PERF-xx]` 用例**（详见 [PERF_TEST_GUIDE](PERF_TEST_GUIDE.md)）
- [ ] **pageSize / 批量上限已在 Controller 校验层拦截**
- [ ] **高频接口已标注（满足任一：QPS>10 / 首屏路径 / 前端轮询），Javadoc 中注明 ≤ 100ms 基线**
- [ ] 实现完成后，逐条对照用例（TC + FLOW + IDEM + CONC + PERF）验证通过
