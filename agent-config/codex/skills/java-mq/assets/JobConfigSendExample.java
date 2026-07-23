// 示例：Service 层发送消息（来自 JobConfigServiceImpl）

// ① 普通消息 + Tag（最常见场景）
RocketMqUtil.sendWithTag(MqConst.TP_JOB, MqConst.TAG_GEN_JD, String.valueOf(entity.getId()));

// ② 普通消息 + Tag，payload 为 DTO 对象（自动 JSON 序列化）
JobPublishMessage message = new JobPublishMessage()
        .setJobId(entity.getId())
        .setCompanyId(entity.getCompanyId());
RocketMqUtil.sendWithTag(MqConst.TP_JOB, MqConst.TAG_JOB_PUBLISH, message);

// ③ 统计消息：tag 来自枚举（枚举持有 mqTag 字段）
RocketMqUtil.sendWithTag(MqConst.TP_HIRE_STAT, bizType.getMqTag(), statMessage);

// ④ 延迟消息：30 秒后投递（场景：超时检查、定时提醒）
RocketMqUtil.delayWithTag(MqConst.TP_JOB, MqConst.TAG_TIMEOUT_CHECK,
        String.valueOf(entity.getId()), 30);

// ⑤ 顺序消息：同一 jobId 的消息严格有序投递（messageGroup = jobId 保证同职位有序）
RocketMqUtil.fifoWithTag(MqConst.TP_JOB, MqConst.TAG_STATUS_CHANGE,
        message, String.valueOf(entity.getId()));
