package {package}.controller;

import {package}.convert.XxxConvert;
import {package}.dto.XxxDTO;
import {package}.dto.XxxVO;
import {package}.service.XxxService;
import {common}.Paged;
import {common}.PageResult;
import {common}.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * {资源} 管理 Controller，提供 {资源} 的增删改查 REST 接口。
 *
 * <p>本层只做协议适配：解析入参 → 调 Service → 封装出参，方法体不超过 3 行，不写业务逻辑。
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@RestController
@RequestMapping("/{path}")
@RequiredArgsConstructor
public class XxxController {

    private final XxxService xxxService;
    private final XxxConvert xxxConvert;

    /**
     * 根据主键 ID 查询 {资源} 详情。
     *
     * @param id 主键 ID
     * @return {资源} 详情 VO，不存在时 Service 层抛出业务异常
     */
    @GetMapping("/{id}")
    public Result<XxxVO> getById(@PathVariable Long id) {
        return Result.ok(xxxConvert.toVO(xxxService.getById(id)));
    }

    /**
     * 分页查询 {资源} 列表，支持多条件筛选。
     *
     * @param pageNum  页码，从 1 开始，默认 1
     * @param pageSize 每页条数，默认 10，Service 层限制最大 100
     * @param name     名称（可选，模糊匹配）
     * @param status   状态（可选）
     * @return 分页列表
     */
    @GetMapping
    public Result<Paged<XxxVO>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Integer status) {
        PageResult<XxxDTO> result = xxxService.list(pageNum, pageSize, name, status);
        return Result.ok(Paged.of(xxxConvert.toVOList(result.getList()), result.getTotal()));
    }

    /**
     * 新增 {资源}。
     *
     * @param dto 入参，必填字段见 {@code XxxDTO} 上的 JSR-303 注解
     * @return 新增记录主键 ID
     */
    @PostMapping
    public Result<Long> create(@Valid @RequestBody XxxDTO dto) {
        return Result.ok(xxxService.create(dto));
    }

    /**
     * 更新 {资源} 信息。
     *
     * @param id  主键 ID
     * @param dto 更新入参，必填字段见 {@code XxxDTO} 上的 JSR-303 注解
     * @return 成功无数据
     */
    @PostMapping("/update/{id}")
    public Result<Void> update(@PathVariable Long id, @Valid @RequestBody XxxDTO dto) {
        xxxService.update(id, dto);
        return Result.ok();
    }

    /**
     * 删除 {资源}（逻辑删除）。
     *
     * @param id 主键 ID
     * @return 成功无数据
     */
    @PostMapping("/remove/{id}")
    public Result<Void> remove(@PathVariable Long id) {
        xxxService.remove(id);
        return Result.ok();
    }
}
