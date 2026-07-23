package com.example.service.convert;

import com.example.service.dto.UserDTO;
import com.example.service.entity.UserEntity;
import com.example.web.dto.UserVO;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;

import java.util.List;

/**
 * 用户对象转换
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Mapper(componentModel = "spring")
public interface UserConvert {

    /**
     * DTO 转 VO（用于 Web 层出参）
     *
     * @param dto 入参
     * @return VO
     */
    UserVO toVO(UserDTO dto);

    /**
     * Entity 转 DTO（用于 Service 层出参）
     *
     * @param entity 实体
     * @return DTO
     */
    UserDTO toDTO(UserEntity entity);

    /**
     * DTO 转 Entity（用于新增场景）
     *
     * @param dto 入参
     * @return Entity
     */
    UserEntity toEntity(UserDTO dto);

    /**
     * 将 DTO 字段复制到已有 Entity（用于 update，避免覆盖审计字段）
     *
     * @param dto    入参
     * @param entity 目标实体，会被原地修改
     */
    void copyToEntity(UserDTO dto, @MappingTarget UserEntity entity);

    /**
     * DTO 列表批量转 VO 列表
     *
     * @param list DTO 列表
     * @return VO 列表
     */
    List<UserVO> toVOList(List<UserDTO> list);
}
