---
name: java-testing
description: >-
  强制 Java 微服务采用测试先行策略，在功能开发前定义覆盖正常/边界/异常/状态流转四维度的测试用例。
  涵盖：各层单元测试模版（Controller/Service/Listener/Handler/Utils）、JUnit 5 + Mockito 写法、方法命名约定、MyBatis-Plus @Spy 陷阱规避。
  适用于：编写单元测试、集成测试、测试用例设计、JUnit、Mockito、Controller 测试、Service 测试、MQ Listener 测试、并发测试、测试先行、用例先行。
compatibility: Java 17+, Spring Boot 3+, JUnit 5, Mockito 5+
metadata:
  domain: java-microservice
  layer: testing
---

# 测试用例规范

**【强制】测试先行**：功能开发前必须先定义用例，覆盖正常/边界/异常/状态流转四个维度，禁止先写实现再补测试。

## 各层模版

| 层 | 模版文件 | 说明 |
|----|---------|------|
| Controller（MockMvc 单元测试） | [XxxControllerTest.java](references/XxxControllerTest.java) | `@WebMvcTest`，Mock Service，不启动容器 |
| Controller（真实接口调用） | [XxxControllerTest.http](references/XxxControllerTest.http) | HTTP 文件，服务运行时直接发起真实请求；放在 `src/test/java/{package}/controller/http/` 下 |
| ServiceImpl | [XxxServiceImplTest.java](references/XxxServiceImplTest.java) | |
| MQ Listener | [XxxListenerTest.java](references/XxxListenerTest.java) | |
| Handler | [XxxHandlerTest.java](references/XxxHandlerTest.java) | |
| Utils | [XxxUtilsTest.java](references/XxxUtilsTest.java) | |
| 并发 | [XxxConcurrentTest.java](references/XxxConcurrentTest.java) | |
| 集成 | [XxxIntegrationTest.java](references/XxxIntegrationTest.java) | |

---

## 步骤：为一个功能定义测试用例

以「发布职位」为例：

```
[TC-01] 给定草稿状态的职位，执行发布 → 状态变为"已发布"         ← 正常场景
[TC-02] 给定职位描述恰好 5000 字（上限），执行发布 → 成功         ← 边界场景
[TC-03] 给定不存在的职位 ID，执行发布 → JOB_NOT_FOUND            ← 异常场景
[TC-04] 给定已发布状态的职位，执行发布 → JOB_STATUS_NOT_ALLOW    ← 状态流转
[TC-05] 给定已关闭状态的职位，执行发布 → JOB_STATUS_NOT_ALLOW    ← 状态流转
[TC-06] 未传职位 ID → 参数校验失败                                ← 边界场景
```

---

## Service 单元测试写法

```java
@ExtendWith(MockitoExtension.class)
class JobConfigServiceImplTest {

    @Mock
    private JobConfigMapper jobConfigMapper;      // Mock 依赖
    @InjectMocks
    private JobConfigServiceImpl jobConfigService; // 被测类

    @Test
    void should_returnJobConfig_when_idExists() {
        // Given
        JobConfigEntity entity = new JobConfigEntity().setId(1L).setName("Java工程师");
        when(jobConfigMapper.selectById(1L)).thenReturn(entity);

        // When
        JobConfigDTO result = jobConfigService.getById(1L);

        // Then
        assertThat(result.getName()).isEqualTo("Java工程师");
    }

    @Test
    void should_throwNotFound_when_idNotExists() {
        when(jobConfigMapper.selectById(99L)).thenReturn(null);

        assertThatThrownBy(() -> jobConfigService.getById(99L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("职位配置不存在");
    }
}
```

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 注入失败导致 NullPointerException | 检查 `@Mock`/`@InjectMocks` 注解，而非改业务代码 |
| 需要 Spring 上下文（如 `@Value`） | 改用 `@SpringBootTest` 集成测试，或用 `@TestPropertySource` 注入配置 |
| Mock 桩返回 null 但业务不期望 null | 补充 `when(...).thenReturn(...)` 桩配置 |
| 状态流转测试需要前置状态 | 用 `@BeforeEach` 准备 Fixture，每个 `@Test` 独立不共享可变状态 |
| 并发场景测试 | 参考 [XxxConcurrentTest.java](references/XxxConcurrentTest.java) 使用 `CountDownLatch`/`ExecutorService` |
| **`MybatisPlusException: baseMapper can not be null`**（`saveOrUpdate`/`updateById` 等） | Service 继承 `ServiceImpl` 时改用 `@Spy @InjectMocks`，在 `@BeforeEach` 全局 `lenient().doReturn(true).when(service).saveOrUpdate(any(...))` |
| **`lambdaQuery()` 调用时 NPE**（获取 entityClass 失败） | 同上，`@BeforeEach` 中 `doReturn(mockChain).when(service).lambdaQuery()` 并显式 stub 链式 builder 方法 |
| **Convert 的 Map 返回方法触发虚假变更**（`verify never` 失败，实体字段意外出现 `{}`） | Mockito 4.x 对 `Map` 返回类型默认返回空 Map 而非 null，`@BeforeEach` 中 `lenient().when(convert.jsonToXxxMap(any())).thenReturn(null)` |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [TEST_CASE_RULES](references/TEST_CASE_RULES.md) | 核心测试规则与用例设计约定 |
| [IDEMPOTENT_TEST_GUIDE](references/IDEMPOTENT_TEST_GUIDE.md) | 幂等场景覆盖（`[IDEM-xx]` 用例） |
| [CONCURRENT_TEST_GUIDE](references/CONCURRENT_TEST_GUIDE.md) | 并发场景覆盖（`[CONC-xx]` 用例） |
| [PERF_TEST_GUIDE](references/PERF_TEST_GUIDE.md) | 性能场景覆盖（`[PERF-xx]` 用例） |
| [MYBATIS_PLUS_TEST_PITFALLS](references/MYBATIS_PLUS_TEST_PITFALLS.md) | MyBatis-Plus @Spy 测试陷阱 |

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# ★ 自动生成测试骨架（ServiceImpl/Controller/Listener → Test 类 @Mock + @InjectMocks + 方法占位）
python3 ~/cursor/skills/java-testing/scripts/generate-test.py <java文件或src目录>
# 示例：为单个 ServiceImpl 生成测试骨架（预览）
python3 ~/cursor/skills/java-testing/scripts/generate-test.py \
  ./assess-service/src/main/java/com/succaiss/assess/service/service/impl/QuestionServiceImpl.java \
  --dry-run
# 示例：批量扫描整个 service 模块，为缺失测试的类生成骨架
python3 ~/cursor/skills/java-testing/scripts/generate-test.py ./assess-service/src/main/java

# 测试风格（方法命名规范 / 禁 @SpringBootTest / Given-When-Then 注释）
bash ~/cursor/skills/java-testing/scripts/check-test-style.sh <模块路径>
# 示例
bash ~/cursor/skills/java-testing/scripts/check-test-style.sh ./assess-service/src/test

# 测试覆盖率（@Service 类是否有配套测试 / 写操作 verify / 覆盖比率）
python3 ~/cursor/skills/java-testing/scripts/check-test-coverage.py <模块根路径>
# 示例
python3 ~/cursor/skills/java-testing/scripts/check-test-coverage.py ./assess-service
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
