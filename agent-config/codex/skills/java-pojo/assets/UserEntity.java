package com.example.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.succaiss.commons.spring.mybatisplus.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import lombok.experimental.Accessors;

/**
 * 用户实体
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
@Accessors(chain = true)
@ToString(callSuper = true)
@EqualsAndHashCode(callSuper = true)
@TableName("user")
public class UserEntity extends BaseEntity {

    /** 用户名 */
    private String name;

    /** 手机号 */
    private String phone;

    /** 状态，见 {@link com.example.service.enums.UserStatusEnum} */
    private Integer status;
}
