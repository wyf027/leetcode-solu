---
name: java-project-structure
description: >-
  定义 Java/Spring Boot 微服务项目的分层结构规范，并提供从 DDL 一键生成全链路代码的脚手架步骤。
  涵盖：parent/api/service/web/commons 模块职责、包命名约定、现有服务示例（system/platform/integration/hire/assess，可扩展）、新建微服务 POM 与 YAML 模版。
  适用于：新建模块、确认分层、划分模块职责、DDL 转代码、脚手架生成、查询某服务的包名与模块规律。
compatibility: Java 17+, Spring Boot 3+, Maven 多模块项目
metadata:
  domain: java-microservice
  layer: project-structure
---

# 项目结构 & DDL 脚手架

---

## 场景一：从 DDL 生成全链路代码

**输入**：一张或多张 `CREATE TABLE` DDL

**步骤**：

1. 读 [DDL_SCAFFOLD](references/DDL_SCAFFOLD.md)，对照类型映射表确定每列的 Java 类型
2. 按表依次生成（顺序不可乱）：
   - **Entity**：继承 `BaseEntity`，`@TableName("{table_name}")`，禁止重声明公共字段（id/createdAt/updatedAt 等）
   - **枚举**：多值字段（type/status/result）→ `XxxEnum implements BaseEnum<Integer, String>`；是否类字段 → 复用 `YesNo`
   - **JSON DTO**：text 字段且注释含「JSON」→ 生成对应 DTO 骨架
   - **Mapper 接口 + XML**：接口继承 `BaseMapper<XxxEntity>`；XML 的 resultMap 必须包含所有字段（含 BaseEntity 公共字段）
   - **Service 接口 + Impl**：放 `{service}-service`
   - **Controller**：放 `{service}-web`
3. 纯关联表（如 `job_skill`）无需独立 Controller，通过主表 Service 管理
4. 生成完成后执行 `java-code-review` skill

**输出示例**（表名 `job_config`，服务 `hire`）：

```
hire-service/src/main/java/com/succaiss/hire/service/
  entity/JobConfigEntity.java
  enums/JobTypeEnum.java
  mapper/JobConfigMapper.java
  service/JobConfigService.java
  service/impl/JobConfigServiceImpl.java
hire-service/src/main/resources/mapper/JobConfigMapper.xml
hire-web/src/main/java/com/succaiss/hire/web/
  controller/JobConfigController.java
```

---

## 场景二：新建微服务（POM + YAML 脚手架）

**输入**：服务名（如 `report`）、端口、业务说明

**步骤**：

1. 读 [POM_TEMPLATES](references/POM_TEMPLATES.md)，依次生成：
   - `{service}/pom.xml`（聚合模块，声明子模块与依赖版本）
   - `{service}-api/pom.xml`（只依赖 `common-openfeign-starter`）
   - `{service}-service/pom.xml`（依赖 `{service}-api` + `common-spring` + 跨服务 API）
   - `{service}-web/pom.xml`（依赖 `{service}-service` + `common-gateway-starter`，含 `spring-boot-maven-plugin`）
2. 读 [YAML_TEMPLATES](references/YAML_TEMPLATES.md)，生成 `{service}-web/src/main/resources/application.yml`：
   - 填入端口、context-path、Nacos 命名空间
   - 确认 `rocketmq.topic-init.topics` 列表（本服务生产的 Topic）
3. 参照 [PROJECT_STRUCTURE](references/PROJECT_STRUCTURE.md)#web启动类标准模板，生成启动类
4. 生成完成后执行 `java-code-review` skill

> **注意**：跨服务 API 依赖（`system-api`、`platform-api` 等）按实际调用需要保留，未使用的删掉，禁止堆积无用依赖。

---

## 场景三：新建模块 / 确认分层

**步骤**：

1. 确认 `{service}` 取值（现有服务，可扩展）：`system | platform | integration | hire | assess`；新增服务先读 `PROJECT_STRUCTURE` 确认端口与 ErrorCode 编码段，并与团队对齐
2. 读 [PROJECT_STRUCTURE](references/PROJECT_STRUCTURE.md)#模块职责，确认代码落在正确模块：

   | 代码类型 | 所属模块 |
   |----------|----------|
   | Entity、Mapper、ServiceImpl、事务 | `{service}-service` |
   | Controller、Application（启动类） | `{service}-web` |
   | Feign 接口、跨服务 DTO、枚举、ErrorCode | `{service}-api` |
   | 通用工具、BaseEnum、Result | `commons/*` |

3. 依赖方向：`web → service → api`，禁止反向依赖；跨服务只依赖 `*-api`

---

## DTO / Request / Response 归属三分法

| 情况 | 放哪 | 说明 |
|------|------|------|
| 其他服务通过 Feign 消费（跨服务契约） | `{service}-api` | 对外暴露 |
| 仅本服务内部使用，service 层和 web 层都要用 | `{service}-service` | 放 web 会违反 web→service 依赖方向 |
| 仅 web 层（Controller）使用 | `{service}-web` | 不需要下沉 |

**核心原则**：`api` 层只给**其他服务**用。功能入口在本服务时，本服务不需要提供 `api` 层，前端 DTO 放 `service` 或 `web`。

---

## 常见边界情况

| 情况 | 处理方式 |
|------|----------|
| 前端 DTO 放哪个模块 | service+web 都用 → `{service}-service/dto`；仅 web → `{service}-web`；跨服务 → `{service}-api` |
| DDL 字段名是 MySQL 保留字（如 `key`、`order`） | Entity 字段加 `@TableField("column_name")` 显式映射 |
| 表无业务枚举字段 | 跳过枚举生成步骤 |
| text 字段注释含「JSON」 | 额外生成一个 DTO 骨架类，Entity 字段 Javadoc 用 `{@link XxxDTO}` 引用 |
| 纯关联表（如 `job_skill_rel`） | 不生成 Controller，通过主业务 Service 管理 |
| 新服务不在现有 5 个内 | 读 PROJECT_STRUCTURE 确认端口与 ErrorCode XX 编码，提前与团队对齐 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [PROJECT_STRUCTURE](references/PROJECT_STRUCTURE.md) | 模块分层约定、包名规律、现有服务清单 |
| [DDL_SCAFFOLD](references/DDL_SCAFFOLD.md) | DDL → 全链路代码生成步骤 |
| [POM_TEMPLATES](references/POM_TEMPLATES.md) | 服务根 / api / service / web 四层 pom.xml 模板 |
| [YAML_TEMPLATES](references/YAML_TEMPLATES.md) | application.yml 模板、Nacos 配置中心托管约定 |

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# ★ 场景一：从 DDL 一键生成全链路代码骨架（Entity/Enum/Mapper/XML/Service/Controller）
python3 ~/cursor/skills/java-project-structure/scripts/generate-scaffold.py <service-root> --ddl <sql文件>
# 示例：预览（不写入文件）
python3 ~/cursor/skills/java-project-structure/scripts/generate-scaffold.py ~/IdeaProjects/assess \
  --ddl ~/IdeaProjects/version/antview/v0.0.0.4/脚本/assess/assess.sql \
  --domain Question --dry-run
# 示例：生成 hire 服务全部表的代码（已存在文件跳过）
python3 ~/cursor/skills/java-project-structure/scripts/generate-scaffold.py ~/IdeaProjects/hire \
  --ddl ~/IdeaProjects/version/antview/v0.0.0.4/脚本/hire/hire.sql

# 代码量统计（各服务 / 分层 Java 文件数和行数）
bash ~/cursor/skills/java-project-structure/scripts/stats.sh <项目根路径>

# 项目结构（模块依赖方向 / 端口冲突 / Entity-Mapper 文件位置）
python3 ~/cursor/skills/java-project-structure/scripts/check-structure.py <项目根路径>

# POM 依赖规范（api 禁重量依赖 / web 须 spring-boot-maven-plugin / 依赖方向）
python3 ~/cursor/skills/java-project-structure/scripts/check-pom.py <项目根路径>

# YAML + 启动类规范（端口约定 / context-path / @EnableFeignClients(basePackages)）
python3 ~/cursor/skills/java-project-structure/scripts/check-yaml.py <项目根路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
>
> 完整参考：[SCRIPTS_QUICK_REFERENCE.md](../SCRIPTS_QUICK_REFERENCE.md)
