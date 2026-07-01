package {package}.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * XxxUtils 单元测试
 *
 * <p>职责：验证工具类每个静态方法在各输入边界下的输出正确性。
 * 无外部依赖，不需要 Spring 容器，纯 JUnit5 执行。
 *
 * <p>覆盖原则：
 * <ul>
 *   <li>每个 public static 方法至少一个测试类（内部嵌套类）</li>
 *   <li>null、空值、边界值、正常值、非法值均有用例</li>
 *   <li>有 throw 行为的路径必须覆盖异常断言</li>
 * </ul>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
class XxxUtilsTest {

    // -------------------------------------------------------------------------
    // doSomething(String input)
    // -------------------------------------------------------------------------

    /**
     * [TC-01] null 输入 → 返回空字符串（默认值）
     */
    @Test
    @DisplayName("doSomething - null 返回默认值")
    void doSomething_null_returnsDefault() {
        assertThat(XxxUtils.doSomething(null)).isEqualTo("");
    }

    /**
     * [TC-02] 空字符串 → 返回空字符串
     */
    @Test
    @DisplayName("doSomething - 空字符串")
    void doSomething_emptyString_returnsEmpty() {
        assertThat(XxxUtils.doSomething("")).isEqualTo("");
    }

    /**
     * [TC-03] 含首尾空白的字符串 → 去除空白后返回
     */
    @Test
    @DisplayName("doSomething - 去除首尾空白")
    void doSomething_withWhitespace_returnsTrimmed() {
        assertThat(XxxUtils.doSomething("  hello  ")).isEqualTo("hello");
    }

    /**
     * [TC-04] 正常字符串 → 原样返回
     */
    @Test
    @DisplayName("doSomething - 正常字符串")
    void doSomething_normal_returnsSame() {
        assertThat(XxxUtils.doSomething("hello")).isEqualTo("hello");
    }

    /**
     * [TC-05] 参数化：多种 null/空 场景均返回空字符串
     */
    @ParameterizedTest
    @NullAndEmptySource
    @DisplayName("doSomething - null 与空返回空字符串（参数化）")
    void doSomething_nullOrEmpty_returnsEmpty(String input) {
        assertThat(XxxUtils.doSomething(input)).isEqualTo("");
    }

    // -------------------------------------------------------------------------
    // 示例：有异常分支的方法测试
    // -------------------------------------------------------------------------

    /**
     * [TC-06] 非法参数 → 抛出 IllegalArgumentException
     *
     * <p>若工具方法对无效输入抛出受检/非受检异常，必须有此类用例。
     */
    @Test
    @DisplayName("doSomething - 非法参数抛出异常")
    void doSomething_invalid_throwsException() {
        assertThatThrownBy(() -> XxxUtils.doSomething("INVALID_FORMAT"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("invalid");
    }

    // -------------------------------------------------------------------------
    // 示例：边界数值方法测试
    // -------------------------------------------------------------------------

    /**
     * [TC-07] 参数化数值边界：0、负数、最大值
     */
    @ParameterizedTest
    @ValueSource(ints = {0, -1, Integer.MAX_VALUE})
    @DisplayName("计算方法 - 数值边界")
    void calculate_boundaryValues(int input) {
        // 替换为实际方法断言
        assertThat(input).isNotNull();
    }
}
