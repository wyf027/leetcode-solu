package com.succaiss.hire.service.listener;

import cn.hutool.core.util.StrUtil;
import com.succaiss.commons.spring.mq.BaseListener;
import com.succaiss.hire.service.constant.MqConst;
import com.succaiss.hire.service.service.TagService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.springframework.stereotype.Component;

/**
 * 标签保障监听器（示例：T = String，消息体为原始字符串）。
 *
 * <p>适用于消息体是单个 ID、名称等简单字符串的场景，
 * {@code BaseListener<String>} 直接透传，不做 JSON 解析。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Slf4j
@Component
@RocketMQMessageListener(
        topic = MqConst.TP_TAG,
        selectorExpression = MqConst.TAG_ENSURE_TAG,
        consumerGroup = MqConst.CG_HIRE
)
public class TagListener extends BaseListener<String> {

    @Resource
    private TagService tagService;

    @Override
    public void onPayload(String name) {
        if (StrUtil.isBlank(name)) {
            log.warn("标签 - 消费 - 消息为空: name = null");
            return;
        }

        tagService.ensure(name);

        log.info("标签 - 消费 - 成功: tagName = {}", name);
    }
}
