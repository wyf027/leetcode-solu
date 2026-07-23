# 消费者开发指南（Consumer Guide）

## T 类型选择

| 场景 | T 类型 | 说明 |
|------|--------|------|
| 消息体是结构化 JSON | Message DTO（或复用 `*-api` 中的 DTO） | BaseListener 自动反序列化 |
| 消息体是单个 ID / 名称 | `String` | BaseListener 直接透传，不解析 |

## 幂等方案

| 层级 | 实现方式 | 适用场景 |
|------|---------|---------|
| Listener 层 | `onPayload` 开头查幂等标记，命中则 `warn + return` | 幂等逻辑简单，不涉及业务状态 |
| Service 层 | Service 内部判断，跳过已处理的记录 | 幂等与业务逻辑强耦合 |

```java
// Listener 层幂等示例
if (xxxService.isProcessed(msg.getBizId())) {
    log.info("业务名 - 消费 - 幂等跳过: bizId = {}", msg.getBizId());
    return;
}
```

## 日志规范

> 三段式：`业务名(中文) - 操作(中文) - 操作结果(中文): key = {}`，**业务名**用 Listener 对应的业务领域中文（如 `评估流程`、`标签`、`简历`），不用 listener 类名。

| 场景 | 级别 | 示例 |
|------|------|------|
| 字段缺失 / 状态不符合预期，主动跳过 | `warn` | `log.warn("业务名 - 消费 - 字段缺失: msg = {}", msg)` |
| 消费成功 | `info` | `log.info("业务名 - 消费 - 成功: bizId = {}", msg.getBizId())` |
| 业务异常（BaseListener 统一处理） | `error`（自动） | 无需手写，BaseListener 捕获后记录 |

**禁止**打整个 DTO 对象（可能含敏感字段）；只打关键业务 ID。

## 消费端错误处理决策

| 错误类型 | 处理方式 | 结果 |
|---------|---------|------|
| 字段缺失 / 数据不合法（不应重试） | `warn + return` | MQ 认为消费成功，不进死信 |
| 下游服务超时 / 暂时不可用（应重试） | 抛出异常（向上传播） | MQ 框架自动重试，最终进死信 |
| 重复消息 | 幂等检查后 `return` | 静默跳过 |

## ConsumerGroup 命名规范

- 全局唯一，格式：`cg_{service}_{topic_abbr}`
- 在消费者服务中自己定义，放 `{consumer-service}` 的 `MqConst` 中，**不写在生产者侧**

```java
// ✅ 消费者服务自己的 MqConst 中定义 CG
String CG_ASSESS_FLOW = "cg_hire_assess_flow";   // hire 服务消费 assess_flow 的 CG

// ❌ 禁止：CG 定义在生产者 MqConst 中
```

## 性能调优参考

| 参数 | 属性名 | 默认值 | 说明 |
|------|--------|--------|------|
| 并发消费线程数 | `consumeThreadNumber` | 20 | 消息量大时可调高 |
| 消费超时（秒） | `consumeTimeout` | 900 | 超时后 MQ 认为失败 |

```java
@RocketMQMessageListener(
        topic = MqConst.TP_XXX,
        selectorExpression = MqConst.TAG_XXX,
        consumerGroup = MqConst.CG_XXX,
        consumeThreadNumber = 5   // 业务串行性强时降低并发
)
```
