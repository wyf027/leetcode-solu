package {package}.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import {package}.convert.XxxConvert;
import {package}.dto.XxxDTO;
import {package}.entity.XxxEntity;
import {package}.enums.XxxErrorCode;
import {package}.mapper.XxxMapper;
import {package}.service.XxxService;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import jakarta.annotation.Resource;

/**
 * Xxx Service 实现
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Slf4j
@Service
public class XxxServiceImpl extends ServiceImpl<XxxMapper, XxxEntity>
        implements XxxService {

    @Resource
    private XxxConvert xxxConvert;

    /**
     * {@inheritDoc}
     * <p>不存在时抛出 {@link XxxErrorCode#XXX_NOT_FOUND}。
     */
    @Override
    public XxxDTO getById(Long id) {
        return xxxConvert.toDTO(findByIdOrThrow(id));
    }

    /**
     * {@inheritDoc}
     * <p>标准三段式分页：入参保护 → count 短路 → 条件查询。
     */
    @Override
    public PageResult<XxxDTO> list(Integer pageNum, Integer pageSize, String name, Integer status) {
        // 入参保护：pageSize 上限 100，防止一次性拉取过多数据
        pageSize = Math.min(pageSize, 100);

        LambdaQueryWrapper<XxxEntity> wrapper = buildListWrapper(name, status);

        // count=0 时短路返回，避免空结果集的无效分页 SQL
        long total = count(wrapper);
        if (total == 0) {
            return PageResult.empty();
        }

        Page<XxxEntity> page = page(new Page<>(pageNum, pageSize), wrapper);
        return PageResult.of(xxxConvert.toDTOList(page.getRecords()), total);
    }

    /**
     * {@inheritDoc}
     * <p>创建前校验唯一性，避免重复数据写入。
     */
    @Override
    public Long create(XxxDTO dto) {
        log.info("示例 - 创建 - 开始: code = {}", dto.getCode());

        // 唯一性校验：同一 code 只允许存在一条记录，重复时快速失败
        if (existsByCode(dto.getCode())) {
            log.warn("示例 - 创建 - 编码重复: code = {}", dto.getCode());
            throw XxxErrorCode.XXX_CODE_DUPLICATED.toEx();
        }

        XxxEntity entity = xxxConvert.toEntity(dto);
        this.save(entity);

        log.info("示例 - 创建 - 成功: id = {}", entity.getId());
        return entity.getId();
    }

    /**
     * {@inheritDoc}
     * <p>使用 {@code copyToEntity} 原地更新，避免覆盖 id、createTime 等审计字段。
     */
    @Override
    public void update(Long id, XxxDTO dto) {
        log.info("示例 - 更新 - 开始: id = {}", id);

        // 存在性前置校验：目标记录不存在时提前抛出，避免无效写操作
        XxxEntity entity = findByIdOrThrow(id);

        // copyToEntity 只覆盖业务字段，id / createTime 等审计字段保持不变
        xxxConvert.copyToEntity(dto, entity);
        this.updateById(entity);

        log.info("示例 - 更新 - 成功: id = {}", id);
    }

    /**
     * {@inheritDoc}
     * <p>逻辑删除由 MyBatis-Plus 自动处理（{@code @TableLogic}），无需手动置位。
     */
    @Override
    public void remove(Long id) {
        log.info("示例 - 删除 - 开始: id = {}", id);

        // 存在性前置校验：删除不存在的记录应抛出异常，而非静默忽略
        findByIdOrThrow(id);

        // @TableLogic 自动将 is_deleted 置 1，数据不会物理删除
        this.removeById(id);

        log.info("示例 - 删除 - 成功: id = {}", id);
    }

    // -------------------------------------------------------------------------
    // 私有方法
    // -------------------------------------------------------------------------

    /**
     * 根据 ID 查询实体，不存在则抛出业务异常。
     * <p>统一存在性校验入口，避免在 getById / update / remove 中重复相同逻辑。
     *
     * @param id 主键
     * @return 实体
     * @throws com.example.commons.base.exception.BusinessException XXX_NOT_FOUND
     */
    private XxxEntity findByIdOrThrow(Long id) {
        XxxEntity entity = getById(id);
        if (entity == null) {
            log.warn("示例 - 查询 - 未找到: id = {}", id);
            throw XxxErrorCode.XXX_NOT_FOUND.toEx();
        }
        return entity;
    }

    /**
     * 判断指定 code 是否已存在。
     * <p>使用 {@code SELECT id ... LIMIT 1} 命中即返回，禁止用 COUNT(*) 做存在性判断。
     *
     * @param code 业务编码
     * @return true 表示已存在
     */
    private boolean existsByCode(String code) {
        return lambdaQuery()
                .select(XxxEntity::getId)
                .eq(XxxEntity::getCode, code)
                .one() != null;
    }

    /**
     * 构造列表查询条件。
     * <p>将可选筛选参数封装为 {@link LambdaQueryWrapper}，使 list 方法保持简洁。
     *
     * @param name   名称（null 时不加该条件）
     * @param status 状态（null 时不加该条件）
     * @return 查询条件
     */
    private LambdaQueryWrapper<XxxEntity> buildListWrapper(String name, Integer status) {
        return new LambdaQueryWrapper<XxxEntity>()
                .like(StringUtils.isNotBlank(name), XxxEntity::getName, name)
                .eq(status != null, XxxEntity::getStatus, status)
                .orderByDesc(XxxEntity::getCreateTime);
    }
}
