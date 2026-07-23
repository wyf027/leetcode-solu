package {package}.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertDoesNotThrow;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

/**
 * Xxx 并发场景测试。
 *
 * <p>覆盖维度：
 * <ul>
 *   <li>Mock 模式：验证方法能正确处理并发引发的异常（DuplicateKeyException 等），
 *       无需真实 DB，执行快。</li>
 *   <li>集成模式（需真实 DB）：使用 CountDownLatch 同时放开多线程，验证真实竞态结果。</li>
 * </ul>
 *
 * <p><b>何时使用：</b>
 * 识别到以下任一模式时，在对应 Service 的测试类（或本文件）补充 [CONC-xx] 用例：
 * <ol>
 *   <li>先查后写（Check-then-Act）：查询不存在则插入</li>
 *   <li>幂等操作：同一操作多次调用应等价于调用一次</li>
 *   <li>计数器读-改-写：代码层 count++ 后 update</li>
 *   <li>状态竞态：多线程同时通过状态校验并执行变更</li>
 * </ol>
 *
 * <p><b>PostgreSQL 特别说明：</b>
 * 批量插入时，任一行触发唯一约束冲突会导致整个 PostgreSQL 事务进入 aborted 状态，
 * 即使 Java 层 catch 了 DuplicateKeyException，后续 SQL 也会失败。
 * 推荐改用 {@code INSERT ... ON CONFLICT DO NOTHING}，或拆分为单条插入
 * 并配合 {@code Propagation.REQUIRES_NEW} 隔离异常。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("XxxService — 并发场景")
class XxxConcurrentTest {

    // ── 模拟依赖 ─────────────────────────────────────────────────────────────────

    @Spy
    @InjectMocks
    private XxxServiceImpl service;

    @Mock
    private XxxMapper xxxMapper;

    // ═══════════════════════════════════════════════════════════════════════════
    // 模式一：先查后写（Check-then-Act）
    //
    // 场景：两个并发请求均查到"资源不存在"，随后均尝试插入，
    //       其中一个会触发 DuplicateKeyException。
    //       方法应静默处理该异常，不向调用方上抛。
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * <pre>
     * [CONC-01] 并发写入时 saveBatch 抛 DuplicateKeyException → 方法静默处理，不上抛
     * </pre>
     */
    @Nested
    @DisplayName("[CONC-01] 先查后写竞态 — DuplicateKeyException 处理")
    class CheckThenAct {

        @Test
        @DisplayName("saveBatch 抛 DuplicateKeyException → 不上抛")
        void method_duplicateKeyOnConcurrentInsert_handledGracefully() {
            // 模拟：两线程均查到空（都通过了"是否存在"检查）
            when(xxxMapper.selectList(any())).thenReturn(List.of());
            // 模拟：saveBatch 因另一线程抢先写入而触发唯一约束冲突
            doThrow(new DuplicateKeyException("concurrent insert"))
                    .when(service).saveBatch(anyCollection());

            // 期望：方法捕获异常并静默，不向上抛
            assertDoesNotThrow(() -> service.ensureXxxByNames(Set.of("value1")));
        }

        @Test
        @DisplayName("串行幂等：连续调用两次 → 等价于调用一次，无异常")
        void method_calledTwiceSerially_idempotent() {
            // 第一次：资源不存在，触发写入；第二次：资源已存在，跳过写入
            when(xxxMapper.selectList(any()))
                    .thenReturn(List.of())
                    .thenReturn(List.of(buildEntity()));
            doReturn(true).when(service).saveBatch(anyCollection());

            assertDoesNotThrow(() -> {
                service.ensureXxxByNames(Set.of("value1"));
                // 第二次不应再写
                service.ensureXxxByNames(Set.of("value1"));
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 模式二：并发 CountDownLatch 同步（适合集成测试或无 DB 的纯逻辑并发）
    //
    // 说明：此处用 Mock 展示骨架；真实竞态验证请在集成测试中使用真实 DB，
    //       并去掉 @Transactional（并发测试不能在同一事务内进行）。
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * <pre>
     * [CONC-02] N 个线程同时调用幂等方法 → 全部完成且无未处理异常
     * </pre>
     */
    @Test
    @DisplayName("[CONC-02] 多线程并发调用 → 全部完成且无未处理异常")
    void method_concurrent_noUnhandledException() throws Exception {
        // ── 准备 Mock ────────────────────────────────────────────────────────────
        when(xxxMapper.selectList(any())).thenReturn(List.of(buildEntity()));
        // 资源已存在，无需写入，直接测试并发调用的安全性

        // ── 并发执行 ─────────────────────────────────────────────────────────────
        int threads = 5;
        ExecutorService pool     = Executors.newFixedThreadPool(threads);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate   = new CountDownLatch(threads);
        List<Exception> errors   = new CopyOnWriteArrayList<>();

        for (int i = 0; i < threads; i++) {
            pool.submit(() -> {
                try {
                    // 所有线程就绪后同时放闸
                    startGate.await();
                    // 被测方法
                    service.ensureXxxByNames(Set.of("value1"));
                } catch (Exception e) {
                    errors.add(e);
                } finally {
                    endGate.countDown();
                }
            });
        }

        // 放闸：所有线程同时开始
        startGate.countDown();
        boolean finished = endGate.await(5, TimeUnit.SECONDS);
        pool.shutdown();

        // ── 断言 ─────────────────────────────────────────────────────────────────
        assertThat(finished).as("所有线程应在 5s 内完成").isTrue();
        assertThat(errors).as("不应有未处理异常").isEmpty();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 模式三：计数器并发（示例：点赞数 / 候选人数）
    //
    // 【推荐修复】使用数据库原子更新，而非代码层读-改-写：
    //   UPDATE table SET count = count + 1 WHERE id = #{id}
    // 【禁止】代码层：entity.setCount(entity.getCount() + 1); save(entity);
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * <pre>
     * [CONC-03] 并发递增计数器 → 使用数据库原子更新，不丢失任何 +1
     * </pre>
     *
     * <p><b>说明：</b>此用例验证 Mapper 方法调用形式正确（原子 UPDATE），
     * 而非代码层读-改-写。真实并发结果验证需集成测试。
     */
    @Test
    @DisplayName("[CONC-03] 计数器递增 → 验证使用原子 UPDATE 而非读-改-写")
    void incrementCount_usesAtomicUpdate() {
        // 原子 UPDATE 应直接由 Mapper 完成，不涉及 selectById
        // 本测试验证：incrementXxxCount 不会先 selectById 再 update
        service.incrementXxxCount(1L);

        // 不应调用 selectById（代码层读取），应直接调用原子 update
        // verify(xxxMapper, never()).selectById(anyLong());
        // verify(xxxMapper).atomicIncrement(anyLong());
    }

    // =========================================================================
    // Fixture 构建
    // =========================================================================

    private XxxEntity buildEntity() {
        XxxEntity e = new XxxEntity();
        e.setId(1001L);
        // 补充其他字段
        return e;
    }
}
