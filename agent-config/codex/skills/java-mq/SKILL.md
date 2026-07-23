---
name: java-mq
description: >-
  规范 Java 微服务中 RocketMQ 消息的发送与消费写法，覆盖 Producer 与 Consumer 两个视角。
  发送者：RocketMqUtil 静态 API（send/sendWithTag/delay/fifo）、在 Service 层发送、日志规范。
  消费者：BaseListener<T> 继承约定、@RocketMQMessageListener 配置、onPayload 入参校验、异常向上传播、幂等设计。
  Topic 归属：生产者定义 Topic 常量，仅内部消费放 service 层，跨服务消费提升到 api 层。
  适用于：发送 MQ 消息、RocketMqUtil、消息监听器、Listener、BaseListener、Topic/Tag/ConsumerGroup、延迟消息、顺序消息、消息幂等、死信处理。
compatibility: Java 17+, Spring Boot 3+, RocketMQ Spring 2+, common-spring（含 RocketMqUtil / BaseListener）
metadata:
  domain: java-microservice
  layer: mq
---

# RocketMQ 开发规范（发送 & 消费）

---

## 新增 Topic 完整变更清单

新增一个 Topic 时，必须同时完成以下所有步骤，缺一不可：

**Step 1 — 确认归属**：判断 Topic 由哪个服务生产，以及是否跨服务消费

**Step 2 — 登记常量**（生产者侧）

```java
// 仅本服务消费 → {service}-service/constant/MqConst.java
// 跨服务消费   → {service}-api/constant/MqConst.java
String TP_XXX         = "tp_xxx";
String TAG_XXX_CREATE = "onCreate";
```

**Step 3 — 注册到 yml**（**只有生产者服务**需要改，消费者不需要）

```yaml
# {service}-web/src/main/resources/application.yml
rocketmq:
  topic-init:
    topics:
      - tp_xxx   # 新增，简短描述用途
```

> `rocketmq.topic-init.topics` 由 `RocketMqTopicInitializer` 在启动时自动创建 Topic；
> Topic 已存在则跳过，Broker 不可达时打 warn 但**不阻断启动**。
> 消费者服务仅配置 `@RocketMQMessageListener`，无需在 yml 中重复声明。

**Step 4 — 编写发送调用**（生产者侧 Service 层）

```java
RocketMqUtil.sendWithTag(MqConst.TP_XXX, MqConst.TAG_XXX_CREATE, payload);
```

**Step 5 — 编写 Listener**（消费者侧，若跨服务则先依赖 `{source}-api`）

```java
@RocketMQMessageListener(
        topic = MqConst.TP_XXX,           // 若跨服务：import {source}-api 的 MqConst
        selectorExpression = MqConst.TAG_XXX_CREATE,
        consumerGroup = MqConst.CG_XXX    // 消费者自己定义 CG
)
public class XxxListener extends BaseListener<XxxMessage> { ... }
```

---

## Topic 常量归属（先确认）

**生产者拥有并定义 Topic，消费者只能引用。**

| Topic 被谁消费 | MqConst 位置 |
|---------------|-------------|
| 仅本服务内部 | `{service}-service/constant/MqConst.java` |
| 其他服务也消费 | 提升到 `{service}-api/constant/MqConst.java` |

```java
// ✅ hire 消费 assess 的消息 → 依赖 assess-api 的 MqConst
import com.succaiss.assess.api.constant.MqConst;

// ❌ 禁止：hire 自行重新定义 assess 的 Topic 字符串
String TP_FLOW = "tp_flow";
```

---

## 发送者视角（Producer）

### API 选型

```java
// 最常用：带 Tag 的普通消息
RocketMqUtil.sendWithTag(MqConst.TP_JOB, MqConst.TAG_GEN_JD, jobId);

// payload 为 DTO，自动序列化为 JSON
RocketMqUtil.sendWithTag(MqConst.TP_JOB, MqConst.TAG_JOB_PUBLISH, message);

// 延迟消息（30s 后投递，支持 1s~2h 共 18 档）
RocketMqUtil.delayWithTag(MqConst.TP_JOB, MqConst.TAG_TIMEOUT_CHECK, jobId, 30);

// 顺序消息（同一 messageGroup 内严格有序）
RocketMqUtil.fifoWithTag(MqConst.TP_JOB, MqConst.TAG_STATUS_CHANGE, message, String.valueOf(jobId));
```

### 发送规范

- **在 Service 层发送**，禁止在 Controller / Mapper / Listener 中直接调 `RocketMqUtil`
- **发送前完成持久化**：先写库成功，再发 MQ；避免发出消息但数据库回滚
- **发送后打日志**：`log.info("MQ - 发送 - 成功: topic = {}, tag = {}, key = {}", topic, tag, key)`
- payload 禁止包含敏感字段（密码/token）；复杂对象用专用 Message DTO，不直接发 Entity

### 消息 DTO 设计

跨服务消息的 payload 类型放 `{service}-api`：

```java
// hire-api/.../message/JobPublishMessage.java
@Data
public class JobPublishMessage implements Serializable {
    private Long jobId;
    private Long companyId;
    private String jobCode;
}
```

---

## 消费者视角（Consumer）

### 三条强制约束

**① 必须 `extends BaseListener<T>`，禁止 `implements RocketMQListener`**

`BaseListener` 统一封装：traceId/userId/companyId 上下文恢复、JSON 反序列化、异常捕获与 error 日志。

**② `onPayload` 中异常必须向上传播，禁止 `try-catch` 后返回 void**

吞异常 = MQ 误判消费成功 = 消息永久丢失，无法重试/进死信。

**③ 所有常量走 `MqConst`，禁止在注解里硬编码字符串**

**Listener 结构**（完整模版见 [XxxListener.java](references/XxxListener.java)）：

```java
@Slf4j @Component
@RocketMQMessageListener(topic = MqConst.TP_XXX, selectorExpression = MqConst.TAG_XXX_CREATE, consumerGroup = MqConst.CG_XXX)
public class XxxListener extends BaseListener<XxxMessage> {
    @Resource private XxxService xxxService;

    @Override
    public void onPayload(XxxMessage msg) {
        if (msg == null || msg.getBizId() == null) { log.warn("业务名 - 消费 - 字段缺失: msg = {}", msg); return; }
        // if (xxxService.isProcessed(msg.getBizId())) { return; }  // 幂等（可选）
        xxxService.handle(msg.getBizId());
        log.info("业务名 - 消费 - 成功: bizId = {}", msg.getBizId());
    }
}
```

T 类型选择、幂等方案、日志规范、性能调优 → 见 [CONSUMER_GUIDE.md](references/CONSUMER_GUIDE.md)

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 发送前数据库事务未提交 | 先确保事务提交（持久化完成）再发 MQ；或使用事务消息 |
| 业务异常不需要重试（如数据不存在） | `warn + return`，让 MQ 认为消费成功，不进死信 |
| 业务异常需要重试（如下游超时） | 让异常向上传播，MQ 框架自动重试，最终进死信队列 |
| 同一消息重复投递 | Service 层或 Listener 层做幂等，防止重复写入 |
| 跨服务消息 DTO 在来源服务 `*-api` 中 | 直接依赖 `*-api` 模块，禁止本服务重复定义相同结构 |
| 消息量大处理慢 | 调整 `consumeThreadNumber`（`@RocketMQMessageListener` 属性） |
| ConsumerGroup 全局重复 | 不同业务线拆分 CG；同一服务通常一个 CG 即可 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [RocketMqUtil_API.md](references/RocketMqUtil_API.md) | 发送 API 方法签名与延迟级别速查 |
| [MqConst.java](references/MqConst.java) | Topic/Tag/ConsumerGroup 常量模版 |
| [XxxListener.java](references/XxxListener.java) | Listener 完整模版 |
| [CONSUMER_GUIDE.md](references/CONSUMER_GUIDE.md) | T 类型选择、幂等方案、日志规范、性能调优 |

**示例**：[JobConfigSendExample.java](assets/JobConfigSendExample.java) · [AssessFlowListener.java](assets/AssessFlowListener.java) · [TagListener.java](assets/TagListener.java)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# MQ 规范（BaseListener / 禁硬编码 Topic / Service 发消息 / DTO Serializable）
bash ~/cursor/skills/java-mq/scripts/check-mq.sh <模块路径>

# MQ 高级检查（onPayload 异常静默 / 入参校验 / 发送后打日志）
python3 ~/cursor/skills/java-mq/scripts/check-mq-advanced.py <模块路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
