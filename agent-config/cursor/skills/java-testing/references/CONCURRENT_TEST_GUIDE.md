# 并发场景覆盖

### 何时必须补充并发用例

以下模式天然存在并发风险，**识别到即必须补 `[CONC-xx]` 用例**：

| 模式 | 典型代码形态 | 并发风险 |
|------|-------------|---------|
| **先查后写**（Check-then-Act） | `if (查询不存在) { 插入 }` / `ensureXxxExists` / upsert | 两线程同时通过查询检查，均触发写入 → DB 唯一约束冲突 |
| **幂等操作** | 触发 AI 生成、发送通知、初始化状态 | 并发触发多次产生重复副作用 |
| **计数器读-改-写** | `count++` 后 `update`（代码层运算） | 并发读相同旧值，各自 +1 后写回 → 实际只增 1 |
| **状态竞态** | 先校验状态再变更（DRAFT → PUBLISHED） | 两线程均通过状态校验，各自执行变更 → 状态跳至非法中间态 |

---

### 用例编号格式

并发用例用 `[CONC-xx]` 编号，记录在对应 Service 方法的 Javadoc 中：

```java
/**
 * 确保标签存在
 *
 * <pre>
 * [CONC-01] 并发创建相同标签 → 仅一条入库，无未处理异常（DuplicateKeyException 被静默）
 * [CONC-02] 串行幂等调用两次 → 结果与调用一次等价
 * </pre>
 */
void ensureEnabledByNames(Collection<String> tagNames);
```

---

### 代码骨架：CountDownLatch 同步模式

```java
@Test
void method_concurrent_noUnhandledException() throws Exception {
    int threads = 5;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch startGate = new CountDownLatch(1);   // 控制同时开始
    CountDownLatch endGate   = new CountDownLatch(threads); // 等待全部结束
    List<Exception> errors   = new CopyOnWriteArrayList<>();

    for (int i = 0; i < threads; i++) {
        pool.submit(() -> {
            try {
                startGate.await();        // 所有线程就绪后同时放闸
                service.doSomething(...); // 被测方法
            } catch (Exception e) {
                errors.add(e);
            } finally {
                endGate.countDown();
            }
        });
    }

    startGate.countDown();               // 放闸，所有线程同时开始
    endGate.await(5, TimeUnit.SECONDS);  // 等全部完成（超时保护）
    pool.shutdown();

    assertThat(errors).isEmpty();        // 无未处理异常
    // 进一步断言：DB 中记录数量、计数器最终值等
}
```

---

### 代码骨架：Mock 模式（验证异常处理，不需要真实 DB）

当只需验证方法能优雅处理某类并发异常（如 `DuplicateKeyException`）时，
用 Mock 直接模拟异常，无需多线程：

```java
@Test
void method_duplicateKeyOnConcurrentInsert_handledGracefully() {
    // 模拟第一次查询返回空（两线程都会看到空）
    when(mapper.selectList(any())).thenReturn(List.of());
    // 模拟 saveBatch 抛出 DuplicateKeyException（另一个线程已先写入）
    doThrow(new DuplicateKeyException("concurrent insert"))
            .when(service).saveBatch(anyCollection());

    // 方法应捕获异常并静默，不向上抛
    assertDoesNotThrow(() -> service.method(...));
}
```

---

### 处置原则与推荐修复

| 竞争模式 | 推荐修复 | 不可接受 |
|---------|---------|---------|
| **先查后写** | DB 唯一约束 + 捕获 `DuplicateKeyException` 静默处理（已建立期望状态则无需重试） | 让异常上抛给调用方，或完全不处理 |
| **幂等操作** | 先查再操作（`SELECT ... LIMIT 1` 判断已存在则跳过）+ 乐观锁版本号 | 每次无条件执行副作用 |
| **计数器** | 数据库原子更新：`UPDATE ... SET count = count + 1 WHERE id = ?` | 代码层读值 → 加减 → 回写 |
| **状态竞态** | 乐观锁（`version` 字段校验）或悲观锁（`SELECT ... FOR UPDATE`）| 无锁直接写，允许中间态 |

> **PostgreSQL 特别说明**：PostgreSQL 中一条 SQL 失败会导致整个事务进入 aborted 状态，
> 即使在 Java 层 catch 了 `DuplicateKeyException`，后续 SQL 也会失败。
> 对于批量插入场景，推荐改用 `INSERT ... ON CONFLICT DO NOTHING`，
> 或拆分为单条插入并配合 `SAVEPOINT`（`Propagation.REQUIRES_NEW`）隔离。
