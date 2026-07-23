package com.example.service.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import java.io.Serializable;

/**
 * 用户主要业务对外对象（create/update 入参，getById/list 出参）
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
public class UserDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 主键 */
    private Long id;

    /** 用户名 */
    @NotBlank(message = "用户名不能为空")
    private String name;

    /** 手机号 */
    private String phone;

    /** 状态，见 {@link com.example.service.enums.UserStatusEnum} */
    private Integer status;

    /** 备注 */
    private String remark;
}
