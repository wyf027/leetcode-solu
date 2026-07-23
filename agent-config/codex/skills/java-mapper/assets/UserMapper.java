package com.example.service.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.service.entity.UserEntity;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户 Mapper。
 *
 * <p>单表 CRUD 优先使用 {@link BaseMapper} 内置方法（已自动处理 {@code @TableLogic} 软删除）；
 * 仅多表 JOIN / 复杂子查询时才在此定义自定义方法，并在 XML 中实现。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public interface UserMapper extends BaseMapper<UserEntity> {

    /**
     * 查询指定部门下的所有正常状态用户（多条件 JOIN 查询示例）。
     *
     * <p>此查询需要关联部门表，无法用 {@code lambdaQuery} 表达，故在 XML 实现。
     * SQL 已在 XML 的 {@code WHERE} 中包含 {@code u.is_deleted = 0}，正确处理软删除。
     *
     * @param deptId 部门 ID
     * @param status 状态，null 时不过滤（见 {@link com.example.service.enums.UserStatusEnum}）
     * @return 用户列表，无结果时返回空集合
     */
    List<UserEntity> listByDept(@Param("deptId") Long deptId, @Param("status") Integer status);
}
