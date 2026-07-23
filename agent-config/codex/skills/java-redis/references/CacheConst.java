package com.succaiss.{service}.service.constants;

/**
 * Redis 缓存 Key 常量。
 *
 * <p>命名规则：{服务域}:{实体}:{操作/类型}，值以 ":" 结尾时表示后接变量（如 id）。</p>
 *
 * <p>注释规范：每个常量必须说明缓存用途、完整 Key 格式、每段变量的含义（来源实体 + 字段名）、TTL 值。</p>
 */
public final class CacheConst {

    private CacheConst() {
    }

    // -------------------------------------------------------------------------
    // 分布式锁（Distributed Lock）
    // -------------------------------------------------------------------------

    /**
     * 评测流程处理分布式锁。
     * 完整 Key：assess:flow:lock:{flowId}
     *   - flowId：评测流程 ID（AssessmentFlowEntity.id）
     * TTL = 30s
     */
    public static final String FLOW_LOCK = "assess:flow:lock:";

    // -------------------------------------------------------------------------
    // 业务缓存（Business Cache）
    // -------------------------------------------------------------------------

    /**
     * C 端用户信息缓存。
     * 完整 Key：system:user:info:{userId}
     *   - userId：C 端用户 ID（UserEntity.id）
     * TTL = 30min
     */
    public static final String USER_INFO = "system:user:info:";

    /**
     * 企业下职位配置缓存。
     * 完整 Key：hire:job:config:{companyId}:{jobId}
     *   - companyId：企业 ID（CompanyEntity.id）
     *   - jobId：职位 ID（JobEntity.id）
     * TTL = 1h
     */
    public static final String JOB_CONFIG = "hire:job:config:";

    // -------------------------------------------------------------------------
    // 计数 / 限流（Counter / Rate Limit）
    // -------------------------------------------------------------------------

    /**
     * 短信发送频率限制。
     * 完整 Key：system:sms:rate:{phone}
     *   - phone：手机号（脱敏展示，如 138****0000）
     * TTL = 60s（与限流窗口一致）
     */
    public static final String SMS_RATE_LIMIT = "system:sms:rate:";
}
