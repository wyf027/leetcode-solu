package {package}.enums;

import com.succaiss.commons.base.enums.ErrorCode;

/**
 * {领域}错误码。
 *
 * <p>格式 XXYYZZZ（7 位）：XX=服务编码、YY=业务模块、ZZZ=具体错误。
 * <ul>
 *   <li>XX 固定：system=10、platform=20、integration=30、hire=40、assess=50</li>
 *   <li>ZZZ 分段：001~099 查询/不存在，100~199 写操作，200~299 状态流转</li>
 * </ul>
 * 详细规则见 ERROR_CODE_DESIGN。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public enum XxxErrorCode implements ErrorCode {

    /** {资源}不存在 */
    XXX_NOT_FOUND(4001001, "{资源}不存在"),

    /** {资源}编码重复，禁止重复创建 */
    XXX_CODE_DUPLICATED(4001101, "{资源}编码已存在"),

    ;

    private final Integer code;
    private final String desc;

    XxxErrorCode(Integer code, String desc) {
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
