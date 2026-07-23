# RocketMqUtil 发送 API 速查

来自 `common-spring`，静态调用，无需注入。

## 方法签名

| 方法 | 说明 |
|------|------|
| `send(topic, payload)` | 普通消息，无 Tag |
| `sendWithTag(topic, tag, payload)` | 普通消息，带 Tag（最常用） |
| `delay(topic, payload, delaySeconds)` | 延迟消息，无 Tag |
| `delayWithTag(topic, tag, payload, delaySeconds)` | 延迟消息，带 Tag |
| `fifo(topic, payload, messageGroup)` | 顺序消息，无 Tag |
| `fifoWithTag(topic, tag, payload, messageGroup)` | 顺序消息，带 Tag |

## 延迟级别（delaySeconds 自动映射）

支持：1s / 5s / 10s / 30s / 1min / 2min / 3min / 4min / 5min / 6min / 7min / 8min / 9min / 10min / 20min / 30min / 1h / 2h

传入值会向上取最近档，超出 2h 则固定为 2h。

## 自动透传 SysContext

发送时自动将当前线程的 `traceId / userId / companyId` 写入消息属性，
消费方 `BaseListener` 会自动从属性中恢复到 `SysContext`，无需业务层手动处理。
