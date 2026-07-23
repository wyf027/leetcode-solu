package com.example.service.enums;

import com.succaiss.commons.base.enums.BaseEnum;
import lombok.AllArgsConstructor;

/**
 * 用户状态枚举。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@AllArgsConstructor
public enum UserStatusEnum implements BaseEnum<Integer, String> {

    /** 正常 */
    NORMAL(0, "正常"),

    /** 禁用，禁用用户不可登录 */
    DISABLED(1, "禁用"),

    ;

    private final Integer code;
    private final String desc;

    @Override
    public Integer code() {
        return code;
    }

    @Override
    public String desc() {
        return desc;
    }
}
