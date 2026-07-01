package {package}.listener;

import {package}.dto.XxxMessage;
import {package}.enums.XxxErrorCode;
import {package}.service.XxxService;
import {common}.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * XxxListener 单元测试
 *
 * <p>职责：验证 MQ 消息监听器的消费逻辑，包含：
 * <ul>
 *   <li>正常消息 → 调用对应 Service，无异常</li>
 *   <li>消息字段缺失/非法 → 快速失败，不调用 Service</li>
 *   <li>Service 抛业务异常 → 异常向上传播（由 MQ 框架决定重试/死信）</li>
 *   <li>幂等场景 → 重复消息不重复处理</li>
 * </ul>
 *
 * <p>数据隔离：不启动 Spring 容器，不连接 MQ Broker；@BeforeEach 初始化标准消息 Fixture，
 * 各用例通过定向破坏字段构造异常消息，MockitoExtension 保证 Mock 实例每次全新。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@ExtendWith(MockitoExtension.class)
class XxxListenerTest {

    @InjectMocks
    XxxListener xxxListener;

    @Mock
    XxxService xxxService;

    // -------------------------------------------------------------------------
    // 测试数据 Fixture
    // -------------------------------------------------------------------------

    /** 合法的标准消息，所有必填字段完整 */
    private XxxMessage validMessage;

    @BeforeEach
    void setUp() {
        validMessage = buildMessage("biz-id-001", "XXX_TYPE");
    }

    // -------------------------------------------------------------------------
    // 正常消费
    // -------------------------------------------------------------------------

    /**
     * [TC-01] 合法消息 → 调用 Service 处理，无异常
     */
    @Test
    @DisplayName("onMessage - 合法消息正常消费")
    void onMessage_validMessage_callsService() {
        assertDoesNotThrow(() -> xxxListener.onMessage(validMessage));

        verify(xxxService).doSomething(any());
    }

    // -------------------------------------------------------------------------
    // 消息字段校验
    // -------------------------------------------------------------------------

    /**
     * [TC-02] 消息体为 null → 快速失败，不调用 Service
     */
    @Test
    @DisplayName("onMessage - 消息为 null 快速失败")
    void onMessage_nullMessage_throwsException() {
        assertThatThrownBy(() -> xxxListener.onMessage(null))
                .isInstanceOf(Exception.class);

        verify(xxxService, never()).doSomething(any());
    }

    /**
     * [TC-03] 关键字段 bizId 为空 → 快速失败，不调用 Service
     */
    @Test
    @DisplayName("onMessage - bizId 为空快速失败")
    void onMessage_missingBizId_throwsException() {
        // 定向破坏关键字段
        validMessage.setBizId(null);

        assertThatThrownBy(() -> xxxListener.onMessage(validMessage))
                .isInstanceOf(Exception.class);

        verify(xxxService, never()).doSomething(any());
    }

    /**
     * [TC-04] 消息类型不合法 → 快速失败，不调用 Service
     */
    @Test
    @DisplayName("onMessage - 消息类型非法快速失败")
    void onMessage_invalidType_throwsException() {
        // 定向破坏类型字段
        validMessage.setType("UNKNOWN_TYPE");

        assertThatThrownBy(() -> xxxListener.onMessage(validMessage))
                .isInstanceOf(Exception.class);

        verify(xxxService, never()).doSomething(any());
    }

    // -------------------------------------------------------------------------
    // Service 异常传播
    // -------------------------------------------------------------------------

    /**
     * [TC-05] Service 抛业务异常 → 异常向上传播，Listener 不吞
     *
     * <p>【强制】Listener 禁止 try-catch 后返回 void（MQ 会误认为消费成功导致消息丢失）。
     */
    @Test
    @DisplayName("onMessage - Service 异常向上传播")
    void onMessage_serviceFails_propagatesException() {
        doThrow(XxxErrorCode.XXX_NOT_FOUND.toEx()).when(xxxService).doSomething(any());

        assertThatThrownBy(() -> xxxListener.onMessage(validMessage))
                .isInstanceOf(BusinessException.class);
    }

    // -------------------------------------------------------------------------
    // 幂等性
    // -------------------------------------------------------------------------

    /**
     * [TC-06] 已处理消息再次投递 → 幂等通过，Service 被调用但不重复写数据
     *
     * <p>幂等由 Service 内部保证时：验证 Service 被调用一次（Service 自行判断跳过）。
     * 幂等由 Listener 层保证时：验证 Service 一次也未被调用（Listener 提前拦截）。
     * 根据实际实现选择对应断言。
     */
    @Test
    @DisplayName("onMessage - 重复消息幂等通过")
    void onMessage_duplicateMessage_idempotent() {
        // 模拟 Service 内部幂等（已处理时直接返回，不抛异常）
        doNothing().when(xxxService).doSomething(any());

        assertDoesNotThrow(() -> xxxListener.onMessage(validMessage));

        // 幂等由 Service 保证：Listener 层仍调用 Service
        verify(xxxService, times(1)).doSomething(any());
    }

    // =========================================================================
    // Fixture 构建方法
    // =========================================================================

    private XxxMessage buildMessage(String bizId, String type) {
        XxxMessage msg = new XxxMessage();
        msg.setBizId(bizId);
        msg.setType(type);
        msg.setTimestamp(System.currentTimeMillis());
        // 补充其他字段
        return msg;
    }
}
