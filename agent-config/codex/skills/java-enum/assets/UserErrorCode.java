package com.example.service.enums;

import com.succaiss.commons.base.enums.ErrorCode;

/**
 * 用户域错误码。
 *
 * <p>格式 XXYYZZZ（7 位）：XX=服务(10=system)、YY=模块(01=user)、ZZZ=具体错误。
 * <ul>
 *   <li>001~099：查询/不存在类</li>
 *   <li>100~199：写操作类</li>
 * </ul>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public enum UserErrorCode implements ErrorCode {

    /** 用户不存在 */
    USER_NOT_FOUND(1001001, "用户不存在"),

    /** 用户名已存在，禁止重复注册 */
    USER_USERNAME_DUPLICATED(1001101, "用户名已存在"),

    /** 用户状态无效，已被禁用 */
    USER_INVALID(1001002, "用户无效"),

    ;

    private final Integer code;
    private final String desc;

    UserErrorCode(Integer code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    @Override
    public Integer code() {
        return code;
    }

    @Override
    public String desc() {
        return desc;
    }
}
