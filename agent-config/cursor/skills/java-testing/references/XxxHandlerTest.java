package {package}.handler;

import {package}.dto.XxxContext;
import {package}.enums.XxxErrorCode;
import {package}.enums.XxxTypeEnum;
import {package}.service.XxxService;
import {common}.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * XxxHandler 单元测试
 *
 * <p>职责：验证 Handler 的处理逻辑，包含：
 * <ul>
 *   <li>support() 方法的匹配条件</li>
 *   <li>handle() 的正常路径与异常路径</li>
 *   <li>依赖的 Service / 外部组件全部 Mock</li>
 * </ul>
 *
 * <p>数据隔离：@BeforeEach 初始化标准 Context；各用例通过定向破坏字段构造非法数据，
 * 不共享可变状态，MockitoExtension 保证 Mock 实例每次测试均为全新。
 *
 * <p>适用场景：责任链 Handler、策略 Handler、MQ 消息处理器、事件处理器等。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@ExtendWith(MockitoExtension.class)
class XxxHandlerTest {

    @InjectMocks
    XxxHandler xxxHandler;

    @Mock
    XxxService xxxService;

    // -------------------------------------------------------------------------
    // 测试数据 Fixture
    // -------------------------------------------------------------------------

    /** 可正常被当前 Handler 处理的标准上下文 */
    private XxxContext validContext;

    @BeforeEach
    void setUp() {
        validContext = buildContext(XxxTypeEnum.TARGET_TYPE, "valid-biz-id");
    }

    // -------------------------------------------------------------------------
    // support()
    // -------------------------------------------------------------------------

    /**
     * [TC-01] 匹配类型 → support() 返回 true
     */
    @Test
    @DisplayName("support - 匹配类型返回 true")
    void support_matchedType_returnsTrue() {
        assertThat(xxxHandler.support(validContext)).isTrue();
    }

    /**
     * [TC-02] 不匹配类型 → support() 返回 false
     */
    @Test
    @DisplayName("support - 不匹配类型返回 false")
    void support_unmatchedType_returnsFalse() {
        XxxContext other = buildContext(XxxTypeEnum.OTHER_TYPE, "other-biz-id");
        assertThat(xxxHandler.support(other)).isFalse();
    }

    // -------------------------------------------------------------------------
    // handle()
    // -------------------------------------------------------------------------

    /**
     * [TC-03] 标准合法上下文 → 处理成功，调用对应 Service
     */
    @Test
    @DisplayName("handle - 正常处理")
    void handle_validContext_callsService() {
        assertDoesNotThrow(() -> xxxHandler.handle(validContext));

        verify(xxxService).doSomething(any());
    }

    /**
     * [TC-04] 关键字段 bizId 为 null（前置条件不满足）→ 抛出业务异常，不调用 Service
     */
    @Test
    @DisplayName("handle - 关键字段为 null 快速失败")
    void handle_missingBizId_throwsExceptionWithoutCallingService() {
        // 定向破坏关键字段
        validContext.setBizId(null);

        assertThatThrownBy(() -> xxxHandler.handle(validContext))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(XxxErrorCode.XXX_NOT_FOUND));

        verify(xxxService, never()).doSomething(any());
    }

    /**
     * [TC-05] 依赖 Service 抛异常 → 异常向上传播，Handler 不吞
     */
    @Test
    @DisplayName("handle - Service 异常向上传播")
    void handle_serviceFails_propagatesException() {
        doThrow(XxxErrorCode.XXX_NOT_FOUND.toEx()).when(xxxService).doSomething(any());

        assertThatThrownBy(() -> xxxHandler.handle(validContext))
                .isInstanceOf(BusinessException.class);
    }

    /**
     * [TC-06] 上下文为 null → 快速失败
     */
    @Test
    @DisplayName("handle - 上下文为 null 快速失败")
    void handle_nullContext_throwsException() {
        assertThatThrownBy(() -> xxxHandler.handle(null))
                .isInstanceOf(Exception.class);
    }

    // =========================================================================
    // Fixture 构建方法
    // =========================================================================

    private XxxContext buildContext(XxxTypeEnum type, String bizId) {
        XxxContext ctx = new XxxContext();
        ctx.setType(type);
        ctx.setBizId(bizId);
        ctx.setXxx("standard-value");
        // 补充其他字段
        return ctx;
    }
}
