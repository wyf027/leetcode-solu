package {package}.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.succaiss.commons.spring.mybatisplus.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import lombok.experimental.Accessors;

/**
 * {实体注释}
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@Data
@Accessors(chain = true)
@ToString(callSuper = true)
@EqualsAndHashCode(callSuper = true)
@TableName("{table_name}")
public class XxxEntity extends BaseEntity {

    /** {字段说明}，见 {@link XxxEnum} */
    private Integer status;

    /** {字段说明} */
    private String name;
}
