package com.succaiss.hire.service.listener;

import com.succaiss.assess.api.constant.MqConst;
import com.succaiss.assess.api.message.AssessmentFlowCreatedMessage;
import com.succaiss.commons.spring.mq.BaseListener;
import com.succaiss.hire.service.service.JobCandidateService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.springframework.stereotype.Component;

/**
 * 评估流程创建事件监听器（示例：消费跨服务消息 assess → hire）。
 *
 * <p><b>设计要点：</b>
 * <ol>
 *   <li>T 使用跨服务 DTO {@link AssessmentFlowCreatedMessage}（来自 assess-api），不重复定义消息类</li>
 *   <li>字段缺失时 {@code warn + return}，不抛异常（避免消息进死信队列）</li>
 *   <li>业务逻辑委托给 Service，Listener 只做入参校验和调度</li>
 * </ol>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Slf4j
@Component
@RocketMQMessageListener(
        topic = MqConst.TP_FLOW,
        selectorExpression = MqConst.TAG_FLOW_CREATE,
        consumerGroup = com.succaiss.hire.service.constant.MqConst.CG_HIRE
)
public class AssessFlowListener extends BaseListener<AssessmentFlowCreatedMessage> {

    @Resource
    private JobCandidateService jobCandidateService;

    @Override
    public void onPayload(AssessmentFlowCreatedMessage msg) {
        if (msg == null || msg.getCandidateId() == null || msg.getFlowType() == null) {
            log.warn("评估流程 - 消费 - 字段缺失: msg = {}", msg);
            return;
        }

        jobCandidateService.updateStatusByFlow(msg.getCandidateId(), msg.getFlowType());

        log.info("评估流程 - 消费 - 成功: flowId = {}, candidateId = {}", msg.getFlowId(), msg.getCandidateId());
    }
}
