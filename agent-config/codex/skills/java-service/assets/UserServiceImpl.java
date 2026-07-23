package com.example.service.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.service.convert.UserConvert;
import com.example.service.dto.UserDTO;
import com.example.service.entity.UserEntity;
import com.example.service.enums.UserErrorCode;
import com.example.service.mapper.UserMapper;
import com.example.service.service.UserService;
import com.example.commons.base.dto.PageResult;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.Resource;

/**
 * 用户 Service 实现。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Slf4j
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, UserEntity>
        implements UserService {

    @Resource
    private UserConvert userConvert;

    /**
     * {@inheritDoc}
     * <p>用户不存在时抛出 {@link UserErrorCode#USER_NOT_FOUND}。
     */
    @Override
    public UserDTO getById(Long id) {
        return userConvert.toDTO(findByIdOrThrow(id));
    }

    /**
     * {@inheritDoc}
     * <p>标准三段式分页：入参保护 → count 短路 → 条件查询。
     */
    @Override
    public PageResult<UserDTO> list(Integer pageNum, Integer pageSize, String name, Integer status) {
        // 入参保护：pageSize 上限 100，防止一次性拉取过多数据
        pageSize = Math.min(pageSize, 100);

        LambdaQueryWrapper<UserEntity> wrapper = buildListWrapper(name, status);

        // count=0 时短路返回，避免空结果集的无效分页 SQL
        long total = count(wrapper);
        if (total == 0) {
            return PageResult.empty();
        }

        Page<UserEntity> page = page(new Page<>(pageNum, pageSize), wrapper);
        return PageResult.of(userConvert.toDTOList(page.getRecords()), total);
    }

    /**
     * {@inheritDoc}
     * <p>创建前校验用户名唯一性；写操作走 {@code rollbackFor = Exception.class} 防 checked 异常漏回滚。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long create(UserDTO dto) {
        log.info("用户 - 创建 - 开始: username = {}", dto.getUsername());

        // 唯一性校验：同一用户名不允许重复注册，重复时快速失败
        if (existsByUsername(dto.getUsername())) {
            log.warn("用户 - 创建 - 用户名重复: username = {}", dto.getUsername());
            throw UserErrorCode.USER_USERNAME_DUPLICATED.toEx();
        }

        UserEntity entity = userConvert.toEntity(dto);
        this.save(entity);

        log.info("用户 - 创建 - 成功: id = {}", entity.getId());
        return entity.getId();
    }

    /**
     * {@inheritDoc}
     * <p>使用 {@code copyToEntity} 原地更新，避免覆盖 id、createdAt 等审计字段。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void update(Long id, UserDTO dto) {
        log.info("用户 - 更新 - 开始: id = {}", id);

        // 存在性前置校验：目标记录不存在时提前抛出，避免无效写操作
        UserEntity entity = findByIdOrThrow(id);

        // copyToEntity 只覆盖业务字段，id / createTime 等审计字段保持不变
        userConvert.copyToEntity(dto, entity);
        this.updateById(entity);

        log.info("用户 - 更新 - 成功: id = {}", id);
    }

    /**
     * {@inheritDoc}
     * <p>逻辑删除由 MyBatis-Plus {@code @TableLogic} 自动处理，无需手动置位。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void remove(Long id) {
        log.info("用户 - 删除 - 开始: id = {}", id);

        // 存在性前置校验：删除不存在的记录应抛出异常，而非静默忽略
        findByIdOrThrow(id);

        // @TableLogic 自动将 is_deleted 置 1，数据不会物理删除
        this.removeById(id);

        log.info("用户 - 删除 - 成功: id = {}", id);
    }

    // -------------------------------------------------------------------------
    // 私有方法
    // -------------------------------------------------------------------------

    /**
     * 根据 ID 查询用户实体，不存在则抛出业务异常。
     *
     * <p>统一存在性校验入口，避免 getById / update / remove 中重复相同逻辑。
     *
     * @param id 用户 ID
     * @return 用户实体
     * @throws com.succaiss.commons.base.exception.BusinessException USER_NOT_FOUND
     */
    private UserEntity findByIdOrThrow(Long id) {
        UserEntity entity = baseMapper.selectById(id);
        if (entity == null) {
            log.warn("用户 - 查询 - 未找到: id = {}", id);
            throw UserErrorCode.USER_NOT_FOUND.toEx();
        }
        return entity;
    }

    /**
     * 判断指定用户名是否已存在。
     *
     * <p>使用 {@code SELECT id LIMIT 1} 命中即返回，禁止用 COUNT(*) 做存在性判断。
     *
     * @param username 用户名
     * @return true 表示已存在
     */
    private boolean existsByUsername(String username) {
        return lambdaQuery()
                .select(UserEntity::getId)
                .eq(UserEntity::getUsername, username)
                .one() != null;
    }

    /**
     * 构造列表查询条件。
     *
     * <p>将可选筛选参数封装为 {@link LambdaQueryWrapper}，使 list 方法保持简洁。
     *
     * @param name   用户名（null 时不加该条件）
     * @param status 状态（null 时不加该条件）
     * @return 查询条件
     */
    private LambdaQueryWrapper<UserEntity> buildListWrapper(String name, Integer status) {
        return new LambdaQueryWrapper<UserEntity>()
                .like(StringUtils.isNotBlank(name), UserEntity::getName, name)
                .eq(status != null, UserEntity::getStatus, status)
                .orderByDesc(UserEntity::getCreateTime);
    }
}
