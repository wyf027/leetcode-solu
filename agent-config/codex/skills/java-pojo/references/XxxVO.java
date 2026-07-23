package {package}.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Xxx 出参 VO（仅 Web 层使用）
 * <p>
 * 禁止包含敏感字段（如 password）。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
public class XxxVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 主键 */
    private Long id;

    /** {字段说明} */
    private String name;

    /** 状态，见 {@link XxxStatusEnum} */
    private Integer status;

    /** 创建时间 */
    private LocalDateTime createTime;
}
