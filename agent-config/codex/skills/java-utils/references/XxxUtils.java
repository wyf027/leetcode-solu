package {package}.utils;

/**
 * Xxx 工具类
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public final class XxxUtils {

    private XxxUtils() {
        throw new UnsupportedOperationException("utility class");
    }

    /**
     * 示例方法
     *
     * @param input 入参
     * @return 处理结果，null 返回默认值
     */
    public static String doSomething(String input) {
        if (input == null) {
            return "";
        }

        return input.trim();
    }
}
