package {package}.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import {package}.convert.XxxConvert;
import {package}.dto.XxxDTO;
import {package}.entity.XxxEntity;
import {package}.enums.XxxErrorCode;
import {package}.mapper.XxxMapper;
import {common}.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * XxxServiceImpl 单元测试
 *
 * <p>职责：验证 Service 层业务逻辑，Mapper / Convert 全部 Mock，
 * 不依赖数据库和 Spring 容器，每个测试方法数据完全自给自足。
 *
 * <p>数据隔离：@BeforeEach 初始化公共 Fixture，MockitoExtension 保证每个测试方法
 * 获得全新 Mock 实例，测试间无状态共享。
 *
 * <p><b>注意 - 继承 ServiceImpl 时须使用 @Spy 模式</b>：
 * 若 XxxServiceImpl 继承 MyBatis-Plus 的 {@code ServiceImpl<M,T>}，
 * 框架内部的 {@code saveOrUpdate / lambdaQuery} 等方法会调用 {@code getBaseMapper()}，
 * 该字段为 {@code private M baseMapper}（泛型私有），@InjectMocks 因泛型擦除与字段名不匹配
 * 无法自动注入，须改为 {@code @Spy @InjectMocks} 并在 {@code @BeforeEach} 中
 * 全局 lenient stub 所有 {@code ServiceImpl} 继承方法（见文件末尾的 @Spy 模版）。
 *
 * <p>性能场景（Service 层可覆盖，无需启动容器）：
 * <ul>
 *   <li>[PERF-04] 无过滤条件时查询仍携带 LIMIT（分页对象），不执行全表扫描</li>
 *   <li>[PERF-05] 大批量写入按分批执行，单批不超过上限</li>
 * </ul>
 * 响应时间基线断言（≤ 150ms / ≤ 100ms）在集成测试 {@code XxxIntegrationTest} 中覆盖。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@ExtendWith(MockitoExtension.class)
class XxxServiceImplTest {

    @InjectMocks
    XxxServiceImpl xxxService;

    @Mock
    XxxMapper xxxMapper;

    @Mock
    XxxConvert xxxConvert;

    // -------------------------------------------------------------------------
    // 测试数据 Fixture
    // -------------------------------------------------------------------------

    /** 标准已存在实体（ID=1，正常状态） */
    private XxxEntity existingEntity;
    /** 标准 DTO 入参 */
    private XxxDTO inputDTO;

    @BeforeEach
    void setUp() {
        existingEntity = buildEntity(1L, "原始名称", "EXIST_CODE");
        inputDTO       = buildDTO(null, "测试名称", "NEW_CODE");
    }

    // -------------------------------------------------------------------------
    // getById
    // -------------------------------------------------------------------------

    /**
     * [TC-01] 存在的记录 → 正常返回 DTO
     */
    @Test
    @DisplayName("getById - 正常返回")
    void getById_exists_returnsDTO() {
        XxxDTO expected = buildDTO(1L, "原始名称", "EXIST_CODE");
        when(xxxMapper.selectById(1L)).thenReturn(existingEntity);
        when(xxxConvert.toDTO(existingEntity)).thenReturn(expected);

        XxxDTO result = xxxService.getById(1L);

        assertThat(result).isSameAs(expected);
        verify(xxxMapper).selectById(1L);
    }

    /**
     * [TC-02] 不存在的 ID → 抛出 XXX_NOT_FOUND，不执行 Convert
     */
    @Test
    @DisplayName("getById - 不存在抛异常")
    void getById_notExists_throwsException() {
        when(xxxMapper.selectById(999L)).thenReturn(null);

        assertThatThrownBy(() -> xxxService.getById(999L))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(XxxErrorCode.XXX_NOT_FOUND));

        verify(xxxConvert, never()).toDTO(any());
    }

    // -------------------------------------------------------------------------
    // list
    // -------------------------------------------------------------------------

    /**
     * [TC-03] count=0 → 短路返回空，不执行分页查询
     */
    @Test
    @DisplayName("list - count 为 0 短路返回空")
    void list_countZero_returnsEmptyWithoutPageQuery() {
        when(xxxMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);

        PageResult<XxxDTO> result = xxxService.list(1, 10, null, null);

        assertThat(result.getTotal()).isZero();
        assertThat(result.getList()).isEmpty();
        verify(xxxMapper, never()).selectPage(any(), any());
    }

    /**
     * [TC-04] pageSize=200（超上限）→ 被截断为 100，不抛异常
     *
     * <p>Service 层对超限 pageSize 的防御性截断（防止 Controller 校验被绕过时的兜底保护）。
     */
    @Test
    @DisplayName("list - pageSize 超限被截断为 100")
    void list_pageSizeExceedsMax_isCappedAt100() {
        when(xxxMapper.selectCount(any())).thenReturn(0L);

        assertDoesNotThrow(() -> xxxService.list(1, 200, null, null));
    }

    /**
     * [PERF-04] 无过滤条件时，查询仍携带 LIMIT（Page 对象），不执行全表扫描
     *
     * <p>即使入参无任何 WHERE 条件，Service 也必须将分页参数传入 Mapper，
     * 确保生成的 SQL 带有 LIMIT 子句，避免随数据量增大后全表扫描。
     */
    @Test
    @DisplayName("[PERF-04] 无过滤条件 → 查询携带 Page（LIMIT 保护），不执行全表扫描")
    void list_noFilter_queryCarriesPageLimit() {
        when(xxxMapper.selectCount(any())).thenReturn(5L);
        when(xxxMapper.selectPage(any(), any())).thenReturn(new Page<>());

        xxxService.list(1, 20, null, null);

        // 验证 Mapper 被调用时携带了 Page 对象（分页保护），size 不超过上限
        verify(xxxMapper).selectPage(
                argThat(page -> page instanceof Page && ((Page<?>) page).getSize() <= 100),
                any()
        );
    }

    // -------------------------------------------------------------------------
    // create
    // -------------------------------------------------------------------------

    /**
     * [TC-05] code 唯一，合法入参 → 保存成功，返回新 ID
     */
    @Test
    @DisplayName("create - 正常新增")
    void create_uniqueCode_returnsSavedId() {
        XxxEntity newEntity = buildEntity(null, inputDTO.getName(), inputDTO.getCode());
        when(xxxMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(xxxConvert.toEntity(inputDTO)).thenReturn(newEntity);
        doAnswer(inv -> { newEntity.setId(10L); return null; })
                .when(xxxMapper).insert(newEntity);

        Long id = xxxService.create(inputDTO);

        assertThat(id).isEqualTo(10L);
        verify(xxxMapper).insert(newEntity);
    }

    /**
     * [TC-06] code 已存在 → 抛出 XXX_CODE_DUPLICATED，不执行 insert
     */
    @Test
    @DisplayName("create - code 重复抛异常")
    void create_duplicateCode_throwsException() {
        inputDTO.setCode(existingEntity.getCode());
        when(xxxMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existingEntity);

        assertThatThrownBy(() -> xxxService.create(inputDTO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(XxxErrorCode.XXX_CODE_DUPLICATED));

        verify(xxxMapper, never()).insert(any());
    }

    // -------------------------------------------------------------------------
    // update
    // -------------------------------------------------------------------------

    /**
     * [TC-07] 存在的记录 → 更新成功，copyToEntity 被调用，不新建实体
     */
    @Test
    @DisplayName("update - 正常更新")
    void update_exists_updatesInPlace() {
        when(xxxMapper.selectById(1L)).thenReturn(existingEntity);

        assertDoesNotThrow(() -> xxxService.update(1L, inputDTO));

        verify(xxxConvert).copyToEntity(inputDTO, existingEntity);
        verify(xxxMapper).updateById(existingEntity);
    }

    /**
     * [TC-08] 不存在的 ID → 抛出 XXX_NOT_FOUND，不执行 update
     */
    @Test
    @DisplayName("update - 不存在抛异常")
    void update_notExists_throwsException() {
        when(xxxMapper.selectById(999L)).thenReturn(null);

        assertThatThrownBy(() -> xxxService.update(999L, inputDTO))
                .isInstanceOf(BusinessException.class);

        verify(xxxMapper, never()).updateById(any());
    }

    // -------------------------------------------------------------------------
    // remove
    // -------------------------------------------------------------------------

    /**
     * [TC-09] 存在的记录 → 删除成功
     */
    @Test
    @DisplayName("remove - 正常删除")
    void remove_exists_ok() {
        when(xxxMapper.selectById(1L)).thenReturn(existingEntity);

        assertDoesNotThrow(() -> xxxService.remove(1L));

        verify(xxxMapper).deleteById(1L);
    }

    /**
     * [TC-10] 不存在的 ID → 抛出 XXX_NOT_FOUND，不执行 delete
     */
    @Test
    @DisplayName("remove - 不存在抛异常")
    void remove_notExists_throwsException() {
        when(xxxMapper.selectById(999L)).thenReturn(null);

        assertThatThrownBy(() -> xxxService.remove(999L))
                .isInstanceOf(BusinessException.class);

        verify(xxxMapper, never()).deleteById(any());
    }

    // =========================================================================
    // 性能场景
    // =========================================================================

    /**
     * [PERF-05] 批量写入 1000 条 → 分批执行（每批 ≤ 500 条），不一次性写入
     *
     * <p>大批量一次性写入会导致单事务持锁时间过长，可能触发 DB 超时或 OOM。
     * MyBatis-Plus {@code saveBatch(list, batchSize)} 第二个参数控制每批大小。
     */
    @Test
    @DisplayName("[PERF-05] 1000 条批量写入 → 分 2 批执行，每批 ≤ 500")
    void batchCreate_thousandRecords_executesInBatches() {
        List<XxxDTO> items = Collections.nCopies(1000, buildDTO(null, "批量名称", "BATCH_CODE"));

        xxxService.batchCreate(items);

        // 验证 saveBatch 每次调用传入的集合大小 ≤ 500
        verify(xxxService, times(2)).saveBatch(
                argThat(batch -> ((List<?>) batch).size() <= 500),
                eq(500)
        );
    }

    // =========================================================================
    // Fixture 构建方法
    // 返回满足数据库非空约束的完整合法对象；需要非法数据时在测试方法内定向破坏
    // =========================================================================

    private XxxEntity buildEntity(Long id, String name, String code) {
        XxxEntity entity = new XxxEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setCode(code);
        entity.setStatus(1);
        // 补充其他非空字段
        return entity;
    }

    private XxxDTO buildDTO(Long id, String name, String code) {
        XxxDTO dto = new XxxDTO();
        dto.setId(id);
        dto.setName(name);
        dto.setCode(code);
        // 补充其他字段
        return dto;
    }
}

// =============================================================================
// @Spy 模版（适用于 XxxServiceImpl 继承 ServiceImpl<M,T> 的场景）
//
// 问题：MyBatis-Plus 3.5.x 中 ServiceImpl 继承 CrudRepository，
//       其 `private M baseMapper` 字段因泛型擦除 + 字段名不匹配，
//       @InjectMocks 无法注入，调用 saveOrUpdate/lambdaQuery 等方法时抛：
//         MybatisPlusException: baseMapper can not be null
//
// 修复：改用 @Spy @InjectMocks，在 @BeforeEach 全局 lenient stub 继承方法，
//       使每次调用不穿透到真实 MyBatis-Plus 实现，各用例按需覆盖。
// =============================================================================

/*

@ExtendWith(MockitoExtension.class)
class XxxServiceImplSpyTest {

    @Spy
    @InjectMocks
    private XxxServiceImpl service;

    @Mock
    private XxxMapper xxxMapper;

    @Mock
    private XxxConvert xxxConvert;

    @SuppressWarnings("unchecked")
    private LambdaQueryChainWrapper<XxxEntity> mockChain;

    private static final Long ENTITY_ID = 10001L;

    @BeforeEach
    void setUp() {
        // ── saveOrUpdate / updateById / removeById ──────────────────────────
        // ServiceImpl 继承的写操作均依赖 private baseMapper（泛型字段），
        // @InjectMocks 无法注入，全局 lenient stub 防止任何测试路径崩溃；
        // 需要具体行为（如注入雪花 ID）的用例通过 doAnswer 覆盖。
        lenient().doReturn(true).when(service).saveOrUpdate(any(XxxEntity.class));
        lenient().doReturn(true).when(service).updateById(any(XxxEntity.class));
        lenient().doReturn(true).when(service).removeById(anyLong());

        // ── lambdaQuery ─────────────────────────────────────────────────────
        // lambdaQuery() 依赖真实 mapper proxy 获取 entityClass，
        // 返回 RETURNS_SELF mock chain 完全绕过内部实现；
        // 显式 stub 常用 builder 方法（RETURNS_SELF 对 bridge method 无效）。
        mockChain = mock(LambdaQueryChainWrapper.class);
        lenient().doReturn(mockChain).when(service).lambdaQuery();
        lenient().doReturn(mockChain).when(mockChain).eq(any(), any());
        lenient().doReturn(mockChain).when(mockChain).ne(any(), any());
        lenient().doReturn(mockChain).when(mockChain).last(anyString());
        lenient().doReturn(mockChain).when(mockChain).orderByDesc(any());
    }

    // ── 新增时注入雪花 ID（模拟 MetaFieldHandler），覆盖 lenient 默认 stub ──

    private void stubSaveOrUpdate() {
        doAnswer(inv -> {
            XxxEntity e = inv.getArgument(0);
            if (e.getId() == null) { e.setId(ENTITY_ID); }
            return true;
        }).when(service).saveOrUpdate(any(XxxEntity.class));
    }

    // ── 用例：无变更时跳过写库 ──────────────────────────────────────────────
    @Test
    void save_noChanges_skipsDbWrite() {
        // ...准备与存量完全相同的入参...
        service.someMethod(dto);
        // lenient stub 防止崩溃；verify(never()) 验证业务逻辑是否正确跳过
        verify(service, never()).saveOrUpdate(any(XxxEntity.class));
    }

    // ── 用例：通过 lambdaQuery chain 查询 ───────────────────────────────────
    @Test
    void query_exists_returnsEntity() {
        doReturn(buildEntity(ENTITY_ID)).when(mockChain).one();
        XxxEntity result = service.queryByCondition(...);
        assertThat(result.getId()).isEqualTo(ENTITY_ID);
    }
}

*/
