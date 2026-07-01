package {package}.constant;

/**
 * MQ Topic / Tag / ConsumerGroup 常量。
 *
 * <p><b>归属规则（必须遵守）：</b>
 * <ul>
 *   <li><b>生产者拥有 Topic</b>：发消息的服务负责定义并维护 Topic/Tag 常量，消费者只能引用。</li>
 *   <li><b>仅本服务内部消费</b> → 放 {@code {service}-service/constant/MqConst.java}（本文件）</li>
 *   <li><b>其他服务也需要消费</b> → 提升到 {@code {service}-api/constant/MqConst.java}，
 *       消费方依赖 {@code {service}-api} 模块引用，禁止在消费方重新定义 Topic 字符串。</li>
 * </ul>
 *
 * <p><b>命名约定：</b>
 * <ul>
 *   <li>Topic：{@code TP_} 前缀，小写下划线（如 {@code tp_job}）</li>
 *   <li>Tag：{@code TAG_} 前缀，驼峰事件动词（如 {@code onPublish}）</li>
 *   <li>ConsumerGroup：{@code CG_} 前缀，服务名（如 {@code cg_hire}）；CG 始终定义在消费方。</li>
 * </ul>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public interface MqConst {

    // -------------------------------------------------------------------------
    // Topic（本服务生产，仅内部消费；若其他服务需消费，移至 {service}-api）
    // -------------------------------------------------------------------------
    String TP_XXX = "tp_xxx";

    // -------------------------------------------------------------------------
    // Tag
    // -------------------------------------------------------------------------
    String TAG_XXX_CREATE = "onCreate";
    String TAG_XXX_UPDATE = "onUpdate";
    String TAG_XXX_REMOVE = "onRemove";

    // -------------------------------------------------------------------------
    // ConsumerGroup（消费方自己定义，通常一个服务一个 CG）
    // -------------------------------------------------------------------------
    String CG_XXX = "cg_xxx";
}
