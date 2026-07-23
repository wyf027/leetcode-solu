package com.example.web.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 用户出参 VO（Web 层）
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
public class UserVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 主键 */
    private Long id;

    /** 用户名 */
    private String name;

    /** 手机号 */
    private String phone;

    /** 状态，见 {@link com.example.service.enums.UserStatusEnum} */
    private Integer status;

    /** 创建时间 */
    private LocalDateTime createTime;
}
