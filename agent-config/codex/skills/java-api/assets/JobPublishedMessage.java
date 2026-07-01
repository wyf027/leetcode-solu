package com.succaiss.hire.api.message;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

/**
 * 职位发布 MQ 消息体，用于通知下游服务（如 assess）职位已发布。
 *
 * <p><b>消息路由：</b>
 * <ul>
 *   <li>Topic：{@code MqConst.TP_JOB}（tp_job）</li>
 *   <li>Tag：{@code MqConst.TAG_JOB_PUBLISH}（onJobPublish）</li>
 * </ul>
 *
 * <p><b>发送方（hire-service）：</b>
 * <pre>{@code
 * RocketMqUtil.sendWithTag(MqConst.TP_JOB, MqConst.TAG_JOB_PUBLISH,
 *         new JobPublishedMessage(jobId, companyId, ...));
 * }</pre>
 *
 * <p><b>消费方示例（assess-service）：</b>
 * <pre>{@code
 * @RocketMQMessageListener(topic = MqConst.TP_JOB, selectorExpression = MqConst.TAG_JOB_PUBLISH,
 *         consumerGroup = "cg_assess_job_publish")
 * public class JobPublishListener extends BaseListener<JobPublishedMessage> { ... }
 * }</pre>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobPublishedMessage implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    /** 职位主键 ID */
    private Long jobId;

    /** 企业 ID，用于下游多租户隔离 */
    private Long companyId;

    /** 部门 ID */
    private Long departmentId;

    /** 职位编码，全局唯一 */
    private String code;

    /** 职位名称 */
    private String name;

    /** 职位类型（枚举 desc，如"全职"）*/
    private String type;

    /** 招聘类型（{@code RecruitTypeEnum.code}） */
    private Integer recruitType;

    /** 职级描述（如"P6"） */
    private String level;

    /** 职位等级（数值，用于排序/筛选） */
    private Integer positionLevel;

    /** 工作地点 */
    private String workLocation;

    /**
     * 资料文件 ID 列表，仅通用职位有值，定向职位为空。
     *
     * <p>下游服务（如 assess）据此文件列表解析知识点并组卷出题。
     * 文件由前端上传，hire 异步解析后回填。
     */
    private List<Long> materialFileIds;
}
