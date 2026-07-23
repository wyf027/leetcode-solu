package {package}.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.succaiss.commons.base.context.SysContext;
import {package}.convert.XxxConvert;
import {package}.dto.XxxCreateDTO;
import {package}.dto.XxxDTO;
import {package}.dto.XxxUpdateDTO;
import {package}.enums.XxxErrorCode;
import {package}.service.XxxService;
import {common}.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import jakarta.annotation.Resource;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * XxxController 单元测试
 *
 * <p>职责：验证 HTTP 层协议映射（路径、Method、入参校验、出参结构），
 * Service / Convert 全部用 @MockBean 替换，不启动完整容器，不访问数据库。
 *
 * <p>数据隔离：每个测试方法独立 Mock，@BeforeEach 仅初始化公共 Fixture，
 * 各测试方法通过 when().thenReturn() 设置本用例所需行为，互不干扰。
 *
 * <p>接口类型标注（影响响应时间基线）：
 * <ul>
 *   <li><b>高频接口</b>（≤ 100ms）：首屏加载路径 / 预计 QPS>10 / 前端轮询间隔 &lt; 5s</li>
 *   <li><b>普通接口</b>（≤ 150ms）：详情查询、表单提交、状态变更等</li>
 * </ul>
 * 接口类型须在方法注释首行标明；响应时间断言在 {@code XxxIntegrationTest} 中覆盖。
 *
 * <p>性能场景（Controller 层可覆盖）：
 * <ul>
 *   <li>[PERF-01] pageSize 超限 → 400，拒绝执行查询（参数校验注解或业务前置校验）</li>
 *   <li>[PERF-02] 批量写入超限 → 400 / 业务异常，不进入 Service</li>
 * </ul>
 *
 * <p>业务链路闭环测试：
 * <pre>
 * [FLOW-01] 主链路
 *   1. 新增 Xxx                 → 返回 ID=1
 *   2. 查询详情                 → 数据一致
 *   3. 更新 Xxx                 → 返回 ok
 *   4. 删除 Xxx                 → 返回 ok
 * </pre>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@WebMvcTest(XxxController.class)
class XxxControllerTest {

    @Resource
    MockMvc mockMvc;

    @Resource
    ObjectMapper objectMapper;

    @MockBean
    XxxService xxxService;

    @MockBean
    XxxConvert xxxConvert;

    // -------------------------------------------------------------------------
    // 测试数据 Fixture
    // 所有 build* 方法返回完整合法对象，每个测试方法按需取用或覆盖部分字段
    // -------------------------------------------------------------------------

    /** 合法的新增请求体 */
    private XxxCreateDTO validCreateDTO;
    /** 合法的更新请求体 */
    private XxxUpdateDTO validUpdateDTO;
    /** Service 正常返回的 DTO */
    private XxxDTO returnedDTO;

    @BeforeEach
    void setUp() {
        reset(xxxService, xxxConvert);

        validCreateDTO = buildCreateDTO();
        validUpdateDTO = buildUpdateDTO();
        returnedDTO    = buildDTO(1L);

        // 写操作需要 userId（由网关注入 SysContext；测试中手动设置）
        SysContext.setUserId(8001L);
    }

    @AfterEach
    void tearDown() {
        SysContext.clear();
    }

    // -------------------------------------------------------------------------
    // getById（普通接口，≤ 150ms，响应时间见 XxxIntegrationTest [PERF-02]）
    // -------------------------------------------------------------------------

    /**
     * [TC-01] 正常查询 → 返回 VO，code=0
     */
    @Test
    @DisplayName("getById - 正常查询")
    void getById_ok() throws Exception {
        when(xxxService.getById(1L)).thenReturn(returnedDTO);

        mockMvc.perform(get("/{path}/1"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(0));
    }

    /**
     * [TC-02] 不存在的 ID → 业务错误码
     */
    @Test
    @DisplayName("getById - 不存在")
    void getById_notFound() throws Exception {
        doThrow(XxxErrorCode.XXX_NOT_FOUND.toEx()).when(xxxService).getById(999L);

        mockMvc.perform(get("/{path}/999"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(XxxErrorCode.XXX_NOT_FOUND.getCode()));
    }

    // -------------------------------------------------------------------------
    // list（普通接口，≤ 150ms，响应时间见 XxxIntegrationTest [PERF-01]）
    //
    // [PERF-01] pageSize=101（超限）→ 400，不执行查询（Controller 层拦截）
    // -------------------------------------------------------------------------

    /**
     * [TC-03] 默认分页参数 → 返回分页结构，code=0
     */
    @Test
    @DisplayName("list - 默认分页")
    void list_defaultParams() throws Exception {
        when(xxxService.list(1, 10, null, null)).thenReturn(PageResult.empty());

        mockMvc.perform(get("/{path}"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(0))
               .andExpect(jsonPath("$.data.list").isArray())
               .andExpect(jsonPath("$.data.total").value(0));
    }

    /**
     * [TC-04] / [PERF-01] pageSize=101（超限）→ 400，Service 不被调用
     *
     * <p>对应规范：参数校验注解（如 {@code @Max(100)}）或业务前置校验在 Controller 层拦截，
     * 避免大 pageSize 导致全表扫描进入 Service 层。
     */
    @Test
    @DisplayName("[PERF-01] pageSize=101 超限 → 400，不执行查询")
    void list_pageSizeExceedsLimit_returns400() throws Exception {
        mockMvc.perform(get("/{path}").param("pageSize", "101"))
               .andExpect(status().isBadRequest());

        // Service 不应被调用（请求在参数校验阶段即被拒绝）
        verify(xxxService, never()).list(any(), any(), any(), any());
    }

    // -------------------------------------------------------------------------
    // create（普通接口，≤ 150ms）
    // -------------------------------------------------------------------------

    /**
     * [TC-05] 合法 Body → 返回新增 ID=1
     */
    @Test
    @DisplayName("create - 正常新增")
    void create_ok() throws Exception {
        when(xxxService.create(any())).thenReturn(1L);

        mockMvc.perform(post("/{path}")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(objectMapper.writeValueAsString(validCreateDTO)))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(0))
               .andExpect(jsonPath("$.data").value(1));
    }

    /**
     * [TC-06] 缺少必填字段 name → 400
     */
    @Test
    @DisplayName("create - 缺少必填字段")
    void create_missingRequired_returns400() throws Exception {
        XxxCreateDTO invalid = buildCreateDTO();
        invalid.setName(null);

        mockMvc.perform(post("/{path}")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(objectMapper.writeValueAsString(invalid)))
               .andExpect(status().isBadRequest());
    }

    /**
     * [TC-07] 空 Body {} → 400
     */
    @Test
    @DisplayName("create - 空 Body")
    void create_emptyBody_returns400() throws Exception {
        mockMvc.perform(post("/{path}")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content("{}"))
               .andExpect(status().isBadRequest());
    }

    /**
     * [TC-08] 无 userId（SysContext 为空）→ 抛出 CURRENT_USER_REQUIRED
     *
     * <p>所有写操作（POST / PUT / DELETE）均须在前置校验阶段验证 userId 存在，
     * 避免 BaseEntity.createdBy 写入 null 导致数据库非空约束异常。
     */
    @Test
    @DisplayName("create - 无 userId → CURRENT_USER_REQUIRED")
    void create_noUserId_throwsCurrentUserRequired() throws Exception {
        SysContext.clear();

        mockMvc.perform(post("/{path}")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(objectMapper.writeValueAsString(validCreateDTO)))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(XxxErrorCode.CURRENT_USER_REQUIRED.getCode()));
    }

    // -------------------------------------------------------------------------
    // update（普通接口，≤ 150ms）
    // -------------------------------------------------------------------------

    /**
     * [TC-09] 合法更新 → 返回 ok
     */
    @Test
    @DisplayName("update - 正常更新")
    void update_ok() throws Exception {
        mockMvc.perform(put("/{path}/1")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(objectMapper.writeValueAsString(validUpdateDTO)))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(0));

        verify(xxxService).update(eq(1L), any());
    }

    // -------------------------------------------------------------------------
    // remove（普通接口，≤ 150ms）
    // -------------------------------------------------------------------------

    /**
     * [TC-10] 正常删除 → 返回 ok
     */
    @Test
    @DisplayName("remove - 正常删除")
    void remove_ok() throws Exception {
        mockMvc.perform(delete("/{path}/1"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(0));

        verify(xxxService).remove(1L);
    }

    /**
     * [TC-11] 不存在的 ID → 业务错误码
     */
    @Test
    @DisplayName("remove - 不存在")
    void remove_notFound() throws Exception {
        doThrow(XxxErrorCode.XXX_NOT_FOUND.toEx()).when(xxxService).remove(999L);

        mockMvc.perform(delete("/{path}/999"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(XxxErrorCode.XXX_NOT_FOUND.getCode()));
    }

    // =========================================================================
    // Fixture 构建方法
    // 每个 build* 方法返回满足所有校验约束的合法对象，是本测试类唯一的数据来源
    // 需要非法数据时，在测试方法内对返回值进行定向破坏（如 set null），而非新建散落对象
    // =========================================================================

    private XxxCreateDTO buildCreateDTO() {
        XxxCreateDTO dto = new XxxCreateDTO();
        dto.setName("测试名称");
        dto.setCode("TEST_CODE");
        // 补充其他必填/有默认值字段
        return dto;
    }

    private XxxUpdateDTO buildUpdateDTO() {
        XxxUpdateDTO dto = new XxxUpdateDTO();
        dto.setName("更新后名称");
        // 补充其他字段
        return dto;
    }

    private XxxDTO buildDTO(Long id) {
        XxxDTO dto = new XxxDTO();
        dto.setId(id);
        dto.setName("测试名称");
        dto.setCode("TEST_CODE");
        return dto;
    }
}
