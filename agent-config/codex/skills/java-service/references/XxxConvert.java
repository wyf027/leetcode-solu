package {package}.convert;

import {package}.dto.XxxDTO;
import {package}.dto.XxxVO;
import {package}.entity.XxxEntity;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;

import java.util.List;

/**
 * Xxx 对象转换（MapStruct）
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Mapper(componentModel = "spring")
public interface XxxConvert {

    /**
     * @param dto Service 层出参
     * @return Web 层出参
     */
    XxxVO toVO(XxxDTO dto);

    /**
     * @param entity 实体
     * @return DTO
     */
    XxxDTO toDTO(XxxEntity entity);

    /**
     * @param dto 入参
     * @return 实体
     */
    XxxEntity toEntity(XxxDTO dto);

    /**
     * 将 DTO 字段复制到已有 Entity（用于 update）
     *
     * @param dto    入参
     * @param entity 目标实体，会被原地修改
     */
    void copyToEntity(XxxDTO dto, @MappingTarget XxxEntity entity);

    /**
     * @param list Entity 列表
     * @return DTO 列表
     */
    List<XxxDTO> toDTOList(List<XxxEntity> list);

    /**
     * @param list DTO 列表
     * @return VO 列表
     */
    List<XxxVO> toVOList(List<XxxDTO> list);
}
