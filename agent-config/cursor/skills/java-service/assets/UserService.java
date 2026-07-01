package com.example.service.service;

import com.example.service.dto.UserDTO;
import com.example.service.entity.UserEntity;
import com.example.commons.base.dto.PageResult;
import com.succaiss.commons.spring.mybatisplus.IBaseService;

/**
 * 用户 Service 接口
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public interface UserService extends IBaseService<UserEntity> {

    /**
     * 根据 ID 查询用户，不存在则抛出业务异常
     *
     * @param id 用户 ID
     * @return 用户 DTO，不存在抛出 UserErrorCode.USER_NOT_FOUND
     */
    UserDTO getById(Long id);

    /**
     * 分页查询用户列表，支持按姓名和状态筛选
     *
     * @param pageNum  页码（从 1 开始）
     * @param pageSize 每页条数
     * @param name     用户名（可选，模糊匹配）
     * @param status   状态（可选，见 UserStatusEnum）
     * @return 分页结果
     */
    PageResult<UserDTO> list(Integer pageNum, Integer pageSize, String name, Integer status);

    /**
     * 新增用户
     *
     * @param dto 入参
     * @return 新建用户 ID
     */
    Long create(UserDTO dto);

    /**
     * 更新用户信息，用户不存在则抛出业务异常
     *
     * @param id  用户 ID
     * @param dto 入参
     */
    void update(Long id, UserDTO dto);

    /**
     * 删除用户，用户不存在则抛出业务异常
     *
     * @param id 用户 ID
     */
    void remove(Long id);
}
