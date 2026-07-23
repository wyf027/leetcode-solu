# 幂等场景覆盖

### 什么是幂等

**幂等**：同一操作执行 N 次与执行 1 次，**业务结果等价，副作用不重复触发**。

| HTTP / 操作类型 | 是否天然幂等 | 说明 |
|---------------|-----------|------|
| GET | 是 | 查询不改变状态 |
| PUT（全量覆盖） | 是 | 每次写入相同值，结果不变 |
| DELETE | 通常是 | 资源已不存在时静默返回即可 |
| POST（创建） | **否，需业务保障** | 重复提交默认会创建多条记录 |
| MQ 消费 | **否，需业务保障** | 消息重投会触发重复处理 |
| 第三方回调 | **否，需业务保障** | 支付/AI 结果回调可能重发 |

---

### 何时必须补充幂等用例

识别到以下任一场景，**必须补 `[IDEM-xx]` 用例**：

| 场景 | 典型触发原因 | 不处理的风险 |
|------|-----------|------------|
| **POST 创建接口** | 用户重复点击、客户端网络超时重试 | 创建多条重复记录 |
| **状态变更操作** | 重复调用 close / cancel / complete | 已是目标状态时报错，或重复触发副作用 |
| **MQ 消费** | Broker 重投（offset 未提交）、消费失败重试 | 发送多封通知、重复扣减库存、重复写库 |
| **第三方回调** | 支付平台、AI 服务回调重发 | 重复处理导致状态错乱或资金异常 |
| **定时任务** | 任务重叠执行或补跑 | 重复操作导致数据异常 |
| **`ensure` 系列方法** | 并发调用或重复调用 | 重复写入、计数累加 |

---

### 用例编号格式

幂等用例用 `[IDEM-xx]` 编号，记录在对应 Service 方法或 Listener 的 Javadoc 中：

```java
/**
 * 处理支付回调
 *
 * <pre>
 * [IDEM-01] 首次回调，订单为 PENDING → 状态变更为 PAID，发送通知（副作用执行 1 次）
 * [IDEM-02] 重复回调，订单已是 PAID  → 跳过，不重复发送通知（副作用执行 0 次）
 * </pre>
 */
void handlePaymentCallback(PaymentCallbackDTO dto);
```

---

### 三种实现模式

**模式 A：先查状态再操作（最通用）**

```java
// 已是目标状态则跳过，适用于状态变更类操作
if (targetStatus.equals(entity.getStatus())) {
    log.info("状态变更 - 已是目标状态，跳过: id = {}", id);
    return;
}
// 执行变更 + 触发副作用
```

**模式 B：唯一约束 + 捕获冲突（适用于写入类操作）**

```java
// 依赖 DB 唯一约束保障不重复写入
try {
    mapper.insert(entity);
} catch (DuplicateKeyException e) {
    log.warn("幂等校验 - 重复提交，忽略: bizKey = {}", entity.getBizKey());
}
```

**模式 C：幂等 Key（适用于 POST 创建接口）**

```java
// 客户端生成幂等 Key，服务端缓存处理结果（Redis TTL 覆盖业务超时）
String idempotencyKey = request.getHeader("X-Idempotency-Key");
if (idempotencyCache.exists(idempotencyKey)) {
    return idempotencyCache.get(idempotencyKey);
}
```

---

### 测试骨架

**Service 层单元测试（串行幂等）**

```java
@Test
@DisplayName("[IDEM-02] 重复调用 → 副作用只触发一次")
void process_calledTwice_sideEffectOnlyOnce() {
    // 第一次：正常处理
    when(xxxMapper.selectById(anyLong())).thenReturn(buildPendingEntity());
    service.process(dto);

    // 第二次：已是目标状态，跳过
    when(xxxMapper.selectById(anyLong())).thenReturn(buildDoneEntity());
    service.process(dto);

    // 副作用（通知、MQ 消息等）只触发一次
    verify(notificationService, times(1)).send(any());
    verify(mqPublisher, times(1)).publish(any());
}
```

**MQ Listener 层（重复消息跳过）**

```java
@Test
@DisplayName("[IDEM-02] 消息重投，资源已处理完毕 → 跳过，核心方法不被调用")
void onMessage_alreadyProcessed_skipsProcessing() {
    // 模拟：消息对应资源已处于终态
    when(xxxService.getById(anyLong())).thenReturn(buildDoneEntity());

    listener.onMessage(buildValidMessage());

    // 核心处理方法不应被调用
    verify(xxxService, never()).doProcess(any());
    // 通知等副作用也不应触发
    verify(notificationService, never()).send(any());
}
```

**幂等 Key 接口测试（Controller 层）**

```java
@Test
@DisplayName("[IDEM-02] 携带相同幂等 Key 重复请求 → 返回首次结果，Service 不被再次调用")
void create_sameIdempotencyKey_returnsFirstResult() throws Exception {
    when(xxxService.create(any())).thenReturn(1L);

    // 第一次请求
    mockMvc.perform(post("/xxx")
            .header("X-Idempotency-Key", "key-001")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(validCreateDTO)))
            .andExpect(jsonPath("$.data").value(1));

    // 第二次请求（相同幂等 Key）
    mockMvc.perform(post("/xxx")
            .header("X-Idempotency-Key", "key-001")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(validCreateDTO)))
            .andExpect(jsonPath("$.data").value(1)); // 返回首次结果

    // Service 只被调用一次
    verify(xxxService, times(1)).create(any());
}
```

---

### 幂等与并发的关系

| 维度 | 幂等（`[IDEM-xx]`） | 并发（`[CONC-xx]`） |
|------|-------------------|-------------------|
| 时序 | 串行重复调用 | 同时并发调用 |
| 关注点 | 同一操作多次执行的最终结果 | 多线程竞态条件下的安全性 |
| 测试方式 | 顺序执行两次，verify 副作用次数 | CountDownLatch / Mock 异常注入 |
| 典型问题 | 副作用重复触发、状态覆盖 | 唯一约束冲突、ABA 问题 |

> 幂等和并发通常相互关联：并发场景要求幂等保障，幂等实现也需要应对并发竞争。
> 建议两类用例均补充，缺一不可。
