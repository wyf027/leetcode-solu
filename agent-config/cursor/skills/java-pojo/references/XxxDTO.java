package {package}.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.io.Serializable;

/**
 * Xxx 主要业务对外对象
 * <p>
 * 一表复用：Create 与 Update 字段重合时统一此类，不再拆 CreateDTO/UpdateDTO。
 * 用途：create/update 入参；getById/list 的 Service 层出参（Controller 转 VO 前）。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
public class XxxDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 主键（update 时必填，create 时由系统生成） */
    private Long id;

    /** {必填字段说明} */
    @NotBlank(message = "xxx 不能为空")
    private String xxx;

    /** {必填字段说明} */
    @NotNull(message = "yyy 不能为空")
    private Long yyy;

    /** 备注 */
    private String remark;
}
