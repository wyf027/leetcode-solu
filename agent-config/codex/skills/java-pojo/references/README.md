# POJO 模版说明

**何时使用**：编写/优化 Entity、DTO、VO 时。

**如何使用**：模版参考本目录；{service} 取值、文件位置见 [PROJECT_STRUCTURE.md](../project-structure/PROJECT_STRUCTURE.md#现有服务及约定)。

**【技能归类】** 本目录仅为技能内归类，便于查找 Entity/DTO/VO 模版。实际项目中仍按类型分开放置：Entity → `entity` 包，DTO → `dto` 包，VO → `dto` 或 `vo` 包。

| 模版 | 用途 | 实际放置 |
|------|------|----------|
| XxxEntity | 数据库实体，继承 BaseEntity | `{service}-service` 的 `entity` 包 |
| XxxDTO | create/update 入参，getById/list Service 层出参 | `{service}-service` 的 `dto` 包 |
| XxxVO | Web 层出参 | `{service}-web` 的 `dto` 或 `vo` 包 |

**一表复用**：Create 与 Update 字段重合时用 XxxDTO，不再拆 CreateDTO/UpdateDTO。

**列表查询**：分页参数（pageNum/pageSize）与筛选条件均用 @RequestParam，查询参数对应 DTO 字段。
