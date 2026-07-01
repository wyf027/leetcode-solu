package com.succaiss.{service}.api.message;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;

/**
 * Xxx MQ 消息体，用于跨服务事件通知。
 *
 * <p><b>消息路由：</b>
 * <ul>
 *   <li>Topic：{@code MqConst.TP_XXX}</li>
 *   <li>Tag：{@code MqConst.TAG_XXX_CREATE}</li>
 * </ul>
 *
 * <p><b>发送方（生产者）：</b>
 * <pre>{@code
 * RocketMqUtil.sendWithTag(MqConst.TP_XXX, MqConst.TAG_XXX_CREATE, new XxxMessage(bizId, companyId));
 * }</pre>
 *
 * <p><b>消费方（监听器）：</b>
 * <pre>{@code
 * @RocketMQMessageListener(topic = MqConst.TP_XXX, selectorExpression = MqConst.TAG_XXX_CREATE,
 *         consumerGroup = MqConst.CG_XXX)
 * public class XxxListener extends BaseListener<XxxMessage> { ... }
 * }</pre>
 *
 * <p><b>设计约束：</b>
 * <ul>
 *   <li>必须有 {@code @NoArgsConstructor}，JSON 反序列化依赖无参构造</li>
 *   <li>必须实现 {@link Serializable}，并声明 {@code serialVersionUID}</li>
 *   <li>只包含消费端实际需要的字段，禁止冗余字段（不做 Entity 全量复制）</li>
 *   <li>禁止包含敏感字段（密码、token、手机号、身份证号）</li>
 *   <li>字段只增不删，保持向后兼容；删除字段需协调所有消费方版本迁移</li>
 * </ul>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class XxxMessage implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    /** 业务主键 ID，消费方据此查询或关联业务数据 */
    private Long bizId;

    /** 企业 ID，用于消费方多租户隔离 */
    private Long companyId;

    // 补充消费端实际需要的字段（不要 dump 整个 Entity）
}
