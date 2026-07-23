package com.example.web.controller;

import com.example.service.service.UserService;
import com.example.service.dto.UserDTO;
import com.example.web.dto.UserVO;
import com.example.service.convert.UserConvert;
import com.example.commons.base.dto.Result;
import com.example.commons.base.dto.Paged;
import com.example.commons.base.dto.PageResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 用户管理 Controller，提供用户的增删改查 REST 接口。
 *
 * <p>本层只做协议适配：解析入参 → 调 Service → 封装出参，不写业务逻辑。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserConvert userConvert;

    /**
     * 根据 ID 查询用户详情。
     *
     * @param id 用户 ID
     * @return 用户详情 VO
     */
    @GetMapping("/{id}")
    public Result<UserVO> getById(@PathVariable Long id) {
        return Result.ok(userConvert.toVO(userService.getById(id)));
    }

    /**
     * 分页查询用户列表，支持按姓名和状态筛选。
     *
     * @param pageNum  页码，从 1 开始，默认 1
     * @param pageSize 每页条数，默认 10，Service 层限制最大 100
     * @param name     用户名（可选，模糊匹配）
     * @param status   状态（可选，见 {@code UserStatusEnum}）
     * @return 分页列表
     */
    @GetMapping
    public Result<Paged<UserVO>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Integer status) {
        PageResult<UserDTO> result = userService.list(pageNum, pageSize, name, status);
        return Result.ok(Paged.of(userConvert.toVOList(result.getList()), result.getTotal()));
    }

    /**
     * 新增用户。
     *
     * @param dto 用户信息，必填字段见 {@code UserDTO} 上的 JSR-303 注解
     * @return 新增用户主键 ID
     */
    @PostMapping
    public Result<Long> create(@Valid @RequestBody UserDTO dto) {
        return Result.ok(userService.create(dto));
    }

    /**
     * 更新用户信息。
     *
     * @param id  用户 ID
     * @param dto 更新入参，必填字段见 {@code UserDTO} 上的 JSR-303 注解
     * @return 成功无数据
     */
    @PostMapping("/{id}/update")
    public Result<Void> update(@PathVariable Long id, @Valid @RequestBody UserDTO dto) {
        userService.update(id, dto);
        return Result.ok();
    }

    /**
     * 删除用户（逻辑删除）。
     *
     * @param id 用户 ID
     * @return 成功无数据
     */
    @PostMapping("/{id}/remove")
    public Result<Void> remove(@PathVariable Long id) {
        userService.remove(id);
        return Result.ok();
    }
}
