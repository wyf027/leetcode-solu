package {package}.enums;

import com.succaiss.commons.base.enums.BaseEnum;
import lombok.AllArgsConstructor;

/**
 * {领域}状态枚举。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@AllArgsConstructor
public enum XxxEnum implements BaseEnum<Integer, String> {

    /** 待处理 */
    PENDING(0, "待处理"),

    /** 已完成 */
    DONE(1, "已完成"),

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
