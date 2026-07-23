package {package}.service;

import {package}.dto.XxxDTO;
import com.succaiss.commons.spring.mybatisplus.IBaseService;
import {package}.entity.XxxEntity;

/**
 * Xxx Service 接口
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public interface XxxService extends IBaseService<XxxEntity> {

    /**
     * @param id 主键 ID
     * @return 详情，不存在抛出 XxxErrorCode.XXX_NOT_FOUND
     */
    XxxDTO getById(Long id);

    /**
     * @param pageNum  页码
     * @param pageSize 每页条数
     * @param name     名称（对应 DTO 字段）
     * @param status   状态（对应 DTO 字段）
     * @return 分页结果
     */
    PageResult<XxxDTO> list(Integer pageNum, Integer pageSize, String name, Integer status);

    /**
     * @param dto 入参
     * @return 新增 ID
     */
    Long create(XxxDTO dto);

    /**
     * @param id  主键 ID
     * @param dto 入参
     */
    void update(Long id, XxxDTO dto);

    /**
     * @param id 主键 ID
     */
    void remove(Long id);
}
