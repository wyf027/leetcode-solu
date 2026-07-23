# 接口性能场景覆盖

### 响应时间基线（强制规范）

| 接口类型 | 响应时间要求 | 典型场景 |
|---------|-----------|---------|
| **高频接口** | **≤ 100ms** | 工作台看板、下拉/搜索、核心列表首屏 |
| **普通接口** | **≤ 150ms** | 详情查询、表单提交、状态变更 |
| **异步/重计算接口** | 视业务协商，不受此约束 | AI 生成、报表导出、批量任务 |

**高频接口判定标准**（满足任一条件即为高频）：
- 预计 QPS > 10
- 在核心页面首屏加载路径上（进入页面即触发）
- 前端轮询类接口（间隔 < 5s）

---

### 为什么需要性能用例

接口层的性能问题通常在功能测试阶段不可见，但在生产环境数据量增大后集中爆发。
以下类型的性能缺陷可以在**自动化测试阶段**拦截，无需等到压测才发现：

| 缺陷类型 | 典型症状 | 可测试层 |
|---------|---------|---------|
| **响应时间超标** | 普通接口 > 150ms / 高频接口 > 100ms | 集成测试（`@Tag("perf")`） |
| 入参无上限保护 | `pageSize=100000` 触发全表扫描 | Controller 测试 |
| 批量接口无限制 | 一次导入 10000 条，OOM 或超时 | Controller 测试 |
| N+1 查询 | 列表查 10 条记录触发 10 次额外 SQL | 集成测试 |
| 全表查询无 LIMIT | 数据量增大后接口慢几十倍 | Service 单元测试 |
| 批量写入未分批 | 大批量一次性写入，事务持锁时间过长 | Service 单元测试 |

---

### 用例编号格式

性能用例用 `[PERF-xx]` 编号，记录在对应 Controller 方法或 Service 方法的 Javadoc 中。
**响应时间要求须在 Javadoc 中明确标注接口类型**：

```java
/**
 * 招聘工作台看板数据（高频接口，首屏加载路径）
 *
 * <pre>
 * [PERF-01] 响应时间 ≤ 100ms（高频接口基线，100 条数据量下）
 * [PERF-02] 查询 SQL 执行次数 ≤ 2（N+1 检测）
 * </pre>
 */
Result<JobConfigDashboardDTO> dashboard();

/**
 * 分页查询职位列表（普通接口）
 *
 * <pre>
 * [PERF-03] pageSize=101（超限）→ 400，拒绝执行查询
 * [PERF-04] 响应时间 ≤ 150ms（普通接口基线，20 条数据量下）
 * [PERF-05] 查询 10 条记录，总 SQL 执行次数 ≤ 3（N+1 检测）
 * </pre>
 */
Result<Paged<JobListDTO>> list(JobQueryDTO query);
```

---

### 场景一：入参防护（Controller 测试）

**【必须覆盖】** 所有接受 `pageSize` / `limit` / 批量集合的接口，均需覆盖超限用例。

```java
/**
 * [PERF-01] pageSize 超上限 → 400，不执行查询
 */
@Test
@DisplayName("[PERF-01] pageSize=101 超限 → 400")
void list_pageSizeExceedsLimit_returns400() throws Exception {
    mockMvc.perform(get("/job/config").param("pageSize", "101"))
            .andExpect(status().isBadRequest());

    // Service 不应被调用（请求在参数校验阶段即被拒绝）
    verify(jobConfigService, never()).page(any(), any());
}

/**
 * [PERF-02] 批量导入超过上限 → 拒绝，不进入 Service
 */
@Test
@DisplayName("[PERF-02] 批量导入 501 条超限 → 业务异常")
void batchImport_exceedsMaxSize_rejectsRequest() throws Exception {
    List<XxxCreateDTO> oversized = Collections.nCopies(501, buildCreateDTO());

    mockMvc.perform(post("/xxx/batch")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(oversized)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(XxxErrorCode.BATCH_SIZE_EXCEEDED.code()));
}
```

---

### 场景二：N+1 查询检测（集成测试）

N+1 问题：查询列表返回 N 条记录，随后对每条记录再发一条 SQL（共 N+1 条）。
使用 `datasource-proxy` 或 `p6spy` 拦截 SQL，在集成测试中断言执行次数。

```java
/**
 * [PERF-03] 列表接口查询 10 条记录，总 SQL 执行次数 ≤ 3（无 N+1）
 *
 * <p>依赖：pom 引入 datasource-proxy-spring-boot-starter，
 * 注入 ProxyDataSourceBuilder 统计 SQL 执行次数。
 */
@Test
@Tag("perf")
@DisplayName("[PERF-03] 列表查询 10 条记录 → SQL 执行次数 ≤ 3")
void list_tenRecords_sqlCountWithinLimit() {
    // 写入 10 条 Fixture
    insertFixtures(10);
    sqlCounter.reset();

    service.page(null, buildDefaultQuery());

    // 允许：1 条 COUNT + 1 条 SELECT + 1 条关联查询（如需）
    assertThat(sqlCounter.count())
            .as("N+1 查询检测：SQL 执行次数超出预期")
            .isLessThanOrEqualTo(3);
}
```

> **配置说明**：在 `application-test.yml` 中启用 datasource-proxy：
> ```yaml
> datasource-proxy:
>   count-query: true
>   slow-query:
>     threshold: 500  # ms
>     enable-logging: true
> ```

---

### 场景三：强制 LIMIT 保护（Service 单元测试）

无 WHERE 条件时，接口不得执行无 LIMIT 的全表查询。

```java
/**
 * [PERF-04] 无过滤条件时，查询仍带 LIMIT 保护，不触发全表扫描
 */
@Test
@DisplayName("[PERF-04] 无过滤条件 → 强制分页，不执行全表查询")
void list_noFilter_stillPaged() {
    JobQueryDTO query = new JobQueryDTO(); // 无任何过滤条件
    query.setCurrent(1);
    query.setSize(20);

    service.page(null, query);

    // 验证 Mapper 被调用时携带了 Page 对象（分页保护）
    verify(jobConfigMapper).selectPage(
            argThat(page -> page.getSize() == 20),
            any()
    );
}
```

---

### 场景四：批量写入分批处理（Service 单元测试）

大批量写入必须分批执行，避免单事务持锁时间过长或触发 DB 超时。

```java
/**
 * [PERF-05] 批量写入 1000 条 → 分批处理（每批 ≤ 500 条），不一次性写入
 */
@Test
@DisplayName("[PERF-05] 1000 条批量写入 → 分 2 批执行")
void batchCreate_thousandRecords_executesInBatches() {
    List<XxxCreateDTO> items = Collections.nCopies(1000, buildCreateDTO());

    service.batchCreate(items);

    // saveBatch 第二个参数为 batchSize，验证每批不超过 500
    verify(service, times(2)).saveBatch(
            argThat(batch -> ((List<?>) batch).size() <= 500),
            eq(500)
    );
}
```

---

### 场景五：响应时间基线（集成测试）

响应时间断言在**集成测试**中执行，标注 `@Tag("perf")` 与功能测试隔离，
按需单独触发（`mvn test -Dgroups=perf`），不强制进入主 CI 流水线。

> **注意**：响应时间断言受 CI 机器负载影响，阈值应留有余量（建议设为基线的 2×）。
> 集成测试验证的是"合理数据量下无明显性能退化"，而非等价于生产压测。

```java
/**
 * [PERF-01] 高频接口响应时间基线：工作台看板 ≤ 100ms
 *
 * <p>数据量：100 条职位记录（模拟日常活跃企业规模）。
 * CI 执行时阈值放宽至 200ms（CI 机器性能 ≈ 生产的 50%）。
 */
@Test
@Tag("perf")
@DisplayName("[PERF-01] 工作台看板（高频）→ 响应时间 ≤ 100ms")
void getDashboard_highFrequency_within100ms() {
    insertFixtures(100); // 写入 100 条 Fixture 数据

    StopWatch watch = new StopWatch();
    watch.start();
    service.getDashboard(COMPANY_ID);
    watch.stop();

    long elapsed = watch.getTotalTimeMillis();
    log.info("仪表盘 - 性能测试 - 完成: elapsed = {}ms", elapsed);

    // CI 环境阈值放宽（生产基线 100ms，CI 允许 200ms）
    long threshold = isCI() ? 200L : 100L;
    assertThat(elapsed)
            .as("高频接口响应超标（生产基线 100ms，当前 %dms）", elapsed)
            .isLessThanOrEqualTo(threshold);
}

/**
 * [PERF-04] 普通接口响应时间基线：列表查询 ≤ 150ms
 *
 * <p>数据量：20 条记录，pageSize=20（标准分页场景）。
 */
@Test
@Tag("perf")
@DisplayName("[PERF-04] 列表查询（普通）→ 响应时间 ≤ 150ms")
void list_normalInterface_within150ms() {
    insertFixtures(20);

    StopWatch watch = new StopWatch();
    watch.start();
    service.page(null, buildDefaultQuery());
    watch.stop();

    long elapsed = watch.getTotalTimeMillis();
    long threshold = isCI() ? 300L : 150L;
    assertThat(elapsed)
            .as("普通接口响应超标（生产基线 150ms，当前 %dms）", elapsed)
            .isLessThanOrEqualTo(threshold);
}

// ── 工具方法 ────────────────────────────────────────────────────────────────

/** 判断当前是否在 CI 环境（通过环境变量识别）。 */
private boolean isCI() {
    return System.getenv("CI") != null || System.getenv("GITHUB_ACTIONS") != null;
}
```

**接口类型与阈值速查表**：

| 接口类型 | 生产基线 | CI 阈值（×2） | 典型场景举例 |
|---------|---------|-------------|------------|
| 高频接口 | 100ms | 200ms | 工作台、下拉搜索、核心列表 |
| 普通接口 | 150ms | 300ms | 详情查询、表单提交、状态变更 |

---

### 不适合自动化测试的性能场景

以下场景需独立压测（JMeter / Gatling），不纳入单元测试 / 集成测试：

| 场景 | 推荐工具 | 说明 |
|------|---------|------|
| 高并发 QPS（100+ TPS） | JMeter / Gatling | CI 环境资源受限，结果不稳定 |
| P99 响应时间（大流量） | JMeter / Gatling | 需真实并发请求，单线程基线≠多线程 P99 |
| 内存泄漏检测 | JProfiler / VisualVM | 需长时间运行观察 |
| 大数据量响应时间（百万级） | JMeter + 压测库 | 依赖真实数据规模 |
| 慢查询 EXPLAIN 分析 | DBA 审查 + 索引设计 | 不适合用代码断言 |

> **强制要求**：高频接口（满足高频判定标准的）上线前必须通过独立压测，
> 验证目标 QPS 下 P99 响应时间符合基线（≤ 100ms），
> 压测结论记录在接口文档的「性能基线」字段，由 Tech Lead 签核。
