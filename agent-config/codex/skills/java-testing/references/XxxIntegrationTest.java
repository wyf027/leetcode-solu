package {package}.service.impl;

import {package}.dto.XxxDTO;
import {package}.entity.XxxEntity;
import {package}.enums.XxxErrorCode;
import {package}.mapper.XxxMapper;
import {package}.service.XxxService;
import {common}.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import jakarta.annotation.Resource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StopWatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Xxx 集成测试（真实数据库）
 *
 * <p>何时使用：需要验证 SQL 逻辑、MyBatis-Plus 查询条件、数据库约束时使用；
 * 纯业务逻辑验证优先使用 {@link XxxServiceImplTest}（速度快，无 DB 依赖）。
 *
 * <p>数据隔离策略（三选一，按项目实际情况选择）：
 * <ol>
 *   <li><b>@Transactional 自动回滚</b>（本模版默认）：每个测试方法结束后回滚，
 *       数据库始终干净，适合大多数场景。</li>
 *   <li><b>@BeforeEach 手动清理</b>：不使用 @Transactional，每次测试前
 *       delete 相关表数据再 insert Fixture，适合测试事务提交行为的场景。</li>
 *   <li><b>@Sql 脚本</b>：通过 {@code @Sql("classpath:sql/xxx_test_data.sql")}
 *       在每个测试前执行 TRUNCATE + INSERT，适合需要精确控制数据集的场景。</li>
 * </ol>
 *
 * <p>性能基线（{@code @Tag("perf")}，按需触发：{@code mvn test -Dgroups=perf}）：
 * <pre>
 * [PERF-01] 普通接口 list → 响应时间 ≤ 150ms（CI 允许 300ms，20 条数据量）
 * [PERF-02] 普通接口 getById → 响应时间 ≤ 150ms（CI 允许 300ms）
 * 若本接口属于高频接口（QPS>10 / 首屏路径 / 前端轮询），阈值改为 100ms / CI 200ms。
 * </pre>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Slf4j
@SpringBootTest
@ActiveProfiles("test")   // 使用 application-test.yml，指向测试库
@Transactional            // 每个测试方法自动回滚，数据不落库，测试间完全隔离
class XxxIntegrationTest {

    @Resource
    XxxService xxxService;

    @Resource
    XxxMapper xxxMapper;

    // -------------------------------------------------------------------------
    // 测试数据 Fixture
    //
    // 【规则】集成测试的 Fixture 数据必须在 @BeforeEach 中写入数据库（而非依赖预置数据）：
    //   1. 不依赖数据库已有数据，避免环境差异导致测试不稳定
    //   2. 字段值使用有语义的常量而非随机数，便于定位问题
    //   3. 配合 @Transactional，每个测试方法结束后自动回滚，互不污染
    // -------------------------------------------------------------------------

    /** 写入数据库后获得的实体 ID */
    private Long savedId;

    @BeforeEach
    void setUp() {
        XxxEntity fixture = buildFixtureEntity();
        xxxMapper.insert(fixture);
        savedId = fixture.getId();
    }

    // -------------------------------------------------------------------------
    // getById
    // -------------------------------------------------------------------------

    /**
     * [TC-01] 查询 @BeforeEach 写入的记录 → 数据一致
     */
    @Test
    @DisplayName("getById - 查询已写入记录")
    void getById_savedRecord_returnsConsistentData() {
        XxxDTO result = xxxService.getById(savedId);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(savedId);
        assertThat(result.getName()).isEqualTo("集成测试名称");
        assertThat(result.getCode()).isEqualTo("IT_CODE_001");
    }

    /**
     * [TC-02] 查询不存在的 ID（使用极大值避免碰撞）→ 抛出 XXX_NOT_FOUND
     */
    @Test
    @DisplayName("getById - 不存在的 ID")
    void getById_nonExistentId_throwsException() {
        assertThatThrownBy(() -> xxxService.getById(Long.MAX_VALUE))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(XxxErrorCode.XXX_NOT_FOUND));
    }

    // -------------------------------------------------------------------------
    // create
    // -------------------------------------------------------------------------

    /**
     * [TC-03] 新增合法记录 → 返回 ID，可查询到
     */
    @Test
    @DisplayName("create - 新增后可查询")
    void create_validDTO_canBeQueried() {
        XxxDTO dto = buildDTO("IT_NEW_CODE", "新增测试名称");

        Long newId = xxxService.create(dto);

        assertThat(newId).isNotNull().isPositive();
        XxxDTO queried = xxxService.getById(newId);
        assertThat(queried.getCode()).isEqualTo("IT_NEW_CODE");
    }

    /**
     * [TC-04] code 与 @BeforeEach Fixture 重复 → 抛出 XXX_CODE_DUPLICATED
     */
    @Test
    @DisplayName("create - code 重复抛异常")
    void create_duplicateCode_throwsException() {
        XxxDTO dto = buildDTO("IT_CODE_001", "另一条记录");

        assertThatThrownBy(() -> xxxService.create(dto))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(XxxErrorCode.XXX_CODE_DUPLICATED));
    }

    // -------------------------------------------------------------------------
    // update
    // -------------------------------------------------------------------------

    /**
     * [TC-05] 更新 @BeforeEach 写入的记录 → 再查字段已变更
     */
    @Test
    @DisplayName("update - 更新后数据变更")
    void update_savedRecord_dataChanged() {
        XxxDTO updateDTO = buildDTO("IT_CODE_001", "更新后名称");

        assertDoesNotThrow(() -> xxxService.update(savedId, updateDTO));

        XxxDTO queried = xxxService.getById(savedId);
        assertThat(queried.getName()).isEqualTo("更新后名称");
    }

    // -------------------------------------------------------------------------
    // remove
    // -------------------------------------------------------------------------

    /**
     * [TC-06] 删除 @BeforeEach 写入的记录 → 再查抛 NOT_FOUND
     */
    @Test
    @DisplayName("remove - 删除后不可查询")
    void remove_savedRecord_cannotBeQueriedAfter() {
        assertDoesNotThrow(() -> xxxService.remove(savedId));

        assertThatThrownBy(() -> xxxService.getById(savedId))
                .isInstanceOf(BusinessException.class);
    }

    // =========================================================================
    // 性能基线（@Tag("perf")）
    //
    // 执行方式：mvn test -Dgroups=perf（不强制进入主 CI 流水线）
    //
    // 规则：
    //   - 高频接口（QPS>10 / 首屏路径 / 前端轮询）：生产基线 100ms，CI 放宽至 200ms
    //   - 普通接口（详情查询、表单提交等）         ：生产基线 150ms，CI 放宽至 300ms
    //   - Fixture 数据量遵循"合理数据量"原则，不做压测级大数据插入
    //   - CI 环境通过 System.getenv("CI") 自动探测，阈值自动放宽
    // =========================================================================

    /**
     * [PERF-01] 列表查询响应时间基线（普通接口，≤ 150ms）
     *
     * <p>若本接口属于高频接口，将 normalThreshold 改为 100，ciThreshold 改为 200，
     * 并更新 DisplayName 为"高频接口"。
     *
     * <p>数据量：20 条记录（模拟日常活跃数据规模）。
     */
    @Test
    @Tag("perf")
    @DisplayName("[PERF-01] 普通接口 list → 响应时间 ≤ 150ms（CI 允许 300ms）")
    void list_normalInterface_responseTimeWithinBaseline() {
        insertFixtures(20);

        StopWatch watch = new StopWatch();
        watch.start();
        xxxService.list(1, 20, null, null);
        watch.stop();

        long elapsed = watch.getTotalTimeMillis();
        long threshold = isCI() ? 300L : 150L;
        log.info("性能测试 - 列表查询 - 完成: elapsed = {}ms, threshold = {}ms", elapsed, threshold);

        assertThat(elapsed)
                .as("普通接口响应超标（生产基线 150ms，当前 %dms）", elapsed)
                .isLessThanOrEqualTo(threshold);
    }

    /**
     * [PERF-02] 详情查询响应时间基线（普通接口，≤ 150ms）
     *
     * <p>数据量：使用 @BeforeEach 写入的单条记录。
     */
    @Test
    @Tag("perf")
    @DisplayName("[PERF-02] 普通接口 getById → 响应时间 ≤ 150ms（CI 允许 300ms）")
    void getById_normalInterface_responseTimeWithinBaseline() {
        StopWatch watch = new StopWatch();
        watch.start();
        xxxService.getById(savedId);
        watch.stop();

        long elapsed = watch.getTotalTimeMillis();
        long threshold = isCI() ? 300L : 150L;
        log.info("性能测试 - 详情查询 - 完成: elapsed = {}ms, threshold = {}ms", elapsed, threshold);

        assertThat(elapsed)
                .as("普通接口响应超标（生产基线 150ms，当前 %dms）", elapsed)
                .isLessThanOrEqualTo(threshold);
    }

    // =========================================================================
    // Fixture 构建方法
    //
    // buildFixtureEntity：用于 @BeforeEach 直接写库，字段值使用固定语义常量
    // buildDTO：用于测试方法内构造业务入参
    // insertFixtures：用于性能测试批量写入合理数据量
    // =========================================================================

    private XxxEntity buildFixtureEntity() {
        XxxEntity entity = new XxxEntity();
        entity.setName("集成测试名称");
        entity.setCode("IT_CODE_001");
        entity.setStatus(1);
        // 补充其他非空字段（必须满足数据库约束）
        return entity;
    }

    private XxxDTO buildDTO(String code, String name) {
        XxxDTO dto = new XxxDTO();
        dto.setCode(code);
        dto.setName(name);
        // 补充其他字段
        return dto;
    }

    /**
     * 批量写入 N 条 Fixture 数据（直接 Mapper 写入，跳过业务校验）。
     * 用于性能测试准备合理数据量，不作为压测数据使用。
     */
    private void insertFixtures(int count) {
        for (int i = 0; i < count; i++) {
            XxxEntity entity = new XxxEntity();
            entity.setName("性能测试名称_" + i);
            entity.setCode("PERF_CODE_" + i);
            entity.setStatus(1);
            // 补充其他非空字段
            xxxMapper.insert(entity);
        }
    }

    /**
     * 判断当前是否在 CI 环境（通过环境变量识别，阈值放宽至生产基线的 2×）。
     *
     * <p>CI 机器性能约为生产环境的 50%，响应时间阈值需相应放宽，
     * 避免因 CI 机器负载抖动导致误报，同时仍能检测出明显的性能退化。
     */
    private boolean isCI() {
        return System.getenv("CI") != null || System.getenv("GITHUB_ACTIONS") != null;
    }
}
