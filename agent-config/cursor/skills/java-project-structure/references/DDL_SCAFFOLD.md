# DDL 脚手架（子功能）

**何时使用**：用户提供 DDL，要求生成 Entity/Mapper/Service/Controller 时必读。

**如何使用**：本文为 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) 的子功能，{service} 取值、文件位置等约定均以主文档为准。

## BaseEntity 公共字段

所有 Entity 继承 `com.succaiss.commons.spring.mybatisplus.BaseEntity`，以下字段**禁止在子类重复声明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键（雪花 ID，@TableId ASSIGN_ID） |
| createdBy | Long | 创建人 ID |
| updatedBy | Long | 更新人 ID |
| createdAt | LocalDateTime | 创建时间（@TableField INSERT） |
| updatedAt | LocalDateTime | 更新时间（@TableField INSERT_UPDATE） |

## Entity 注解顺序

```java
@Data
@Accessors(chain = true)
@ToString(callSuper = true)
@EqualsAndHashCode(callSuper = true)
@TableName("{table_name}")
```

- `@TableName` 仅表名，无 schema 前缀
- SQL 保留字字段（如 `count`、`order`、`key`）需显式 `@TableField("column_name")`

## 生成流程

0. **获取 @author 信息**（首次生成时执行一次）：执行 `git config user.name` 获取 `${AUTHOR_NAME}`，连同当前 IDE 名称（`${TOOL_NAME}`）、AI 模型名称（`${MODEL_NAME}`）、当前日期（`${DATE}`，格式 `yyyy/MM/dd`）填入所有生成文件的 Javadoc `@author` / `@since`
1. 解析 SQL 建表语句与 comment
2. 按表依次生成：
   - Entity（继承 BaseEntity）→ [pojo/XxxEntity.java](../pojo/XxxEntity.java)
   - 枚举（多值字段，实现 BaseEnum）→ [enum/XxxEnum.java](../enum/XxxEnum.java)
   - JSON DTO（text 且 comment 含 JSON）→ [pojo/](../pojo/)
   - Mapper 接口 → [mapper/XxxMapper.java](../mapper/XxxMapper.java)
   - Mapper XML → [mapper/XxxMapper.xml](../mapper/XxxMapper.xml)
   - Service 接口 + Impl → [service/](../service/)
   - Controller → [controller/XxxController.java](../controller/XxxController.java)
3. 是否类字段（is_deleted 等）复用 `YesNo`，禁止新建枚举
4. 纯关联表（如 `paper_question`）无需独立 Controller，通过主表 Service 管理
5. 文件位置：Entity/Mapper/Service → *-service；Controller → *-web
6. Mapper XML → *-service/src/main/resources/mapper/
7. **{service}** 取值：system、platform、integration、hire、assess，见 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md#现有服务及约定)

## 枚举规则

- 多值字段（type/status/result）→ 生成 `{字段语义}Enum`，实现 `BaseEnum<Integer, String>`
- 是否类字段（is_correct、is_deleted）→ 复用 `com.succaiss.commons.base.enums.YesNo`
- Entity 字段 Javadoc 必须标注 `{@link XxxEnum}`

## JSON DTO 规则

text 字段且 comment 含"JSON"→ 生成对应 DTO 骨架类：
- `@Getter @Setter` + `implements Serializable`
- 类 Javadoc 标注对应表名和字段名
- Entity 字段 Javadoc 用 `{@link XxxDTO}` 引用

## 类型映射

| SQL | Java |
|-----|------|
| bigint | Long |
| int/smallint | Integer |
| decimal | BigDecimal |
| varchar/text | String |
| timestamp | LocalDateTime |
| boolean | Boolean |

## 路径规则

表名 `_` 拆为 `/` 层级：answer_record → /answer/record

## resultMap

必须包含所有字段（含 BaseEntity 公共字段），完整映射。
