package {package}.listener;

import com.succaiss.commons.spring.mq.BaseListener;
import {package}.constant.MqConst;
import {package}.service.XxxService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.springframework.stereotype.Component;

/**
 * Xxx 监听器。
 * 消费 Topic {@code MqConst.TP_XXX} / Tag {@code MqConst.TAG_XXX} 消息，
 * 简要说明消息来源与本 Listener 的业务职责。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Slf4j
@Component
@RocketMQMessageListener(
        topic = MqConst.TP_XXX,
        selectorExpression = MqConst.TAG_XXX,
        consumerGroup = MqConst.CG_XXX
)
public class XxxListener extends BaseListener<XxxMessage> {   // T = 消息体 DTO；纯 ID 场景用 String

    @Resource
    private XxxService xxxService;

    @Override
    public void onPayload(XxxMessage msg) {
        // 1. 入参校验 —— 字段缺失时 warn 日志 + return，不抛异常（避免死信）
        if (msg == null || msg.getBizId() == null) {
            log.warn("业务名 - 消费 - 字段缺失: msg = {}", msg);
            return;
        }

        // 2. 幂等校验（可选）—— 已处理则直接 return
        // if (xxxService.isProcessed(msg.getBizId())) {
        //     log.info("业务名 - 消费 - 幂等跳过: bizId = {}", msg.getBizId());
        //     return;
        // }

        // 3. 业务处理 —— 异常交由 BaseListener 捕获后记 error 日志，由 MQ 框架决定重试/死信
        xxxService.handleXxx(msg.getBizId(), msg.getData());

        log.info("业务名 - 消费 - 成功: bizId = {}", msg.getBizId());
    }
}
