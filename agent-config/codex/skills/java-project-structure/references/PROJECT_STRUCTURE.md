# 项目结构规范

**何时使用**：涉及 api/service/web、parent、职责边界、分层设计、或 DDL→全链路代码生成时必读。

**如何使用**：分层/结构/服务约定读本文；DDL 生成 Entity/Mapper/Service/Controller 见 [DDL_SCAFFOLD.md](./DDL_SCAFFOLD.md)。

## 标准骨架

```
parent/
└── pom.xml

{service}/
├── pom.xml
├── {service}-api/       # 对外契约
├── {service}-service/   # 业务逻辑
└── {service}-web/       # 启动与接入

commons/
├── common-base/
├── common-spring/
└── ...
```

## 依赖方向

`web -> service -> api`

- web 依赖 service，不可反向
- service 依赖 api、commons
- api 只承载契约，不依赖 service/web
- 跨服务只依赖 *-api，禁止依赖 *-service

## 模块职责

| 模块 | 允许 | 禁止 |
|------|------|------|
| parent | 版本、依赖、插件、构建 | 业务代码 |
| api | Feign、跨服务 DTO/枚举/错误码 | Controller、Mapper、Entity、Swagger |
| service | Service、Entity、Mapper、事务 | Controller、HTTP 细节、Request/Response DTO |
| web | Application、Controller、配置、Swagger | 核心业务、Mapper、SQL |
| commons | Result、ErrorCode、Redis、通用工具 | 具体业务语义 |

## 现有服务及约定

| 服务 | 端口 | 说明 |
|------|------|------|
| system | 10001 | 系统人资、用户、组织、行政区划、学校 |
| platform | 10002 | 平台、站内信、邮件、附件、操作日志 |
| integration | 10003 | 集成、第三方接口对接 |
| hire | 10004 | 招聘、职位、候选人、录用 |
| assess | 10005 | 评估、申请投递、面试、OA 测试 |

**【约定】** 端口：本地多服务同时启动时不可冲突。

**【约定】** 启动类 Feign 扫描：所有微服务启动类统一使用 `@EnableFeignClients(basePackages = "com.succaiss")`，禁止写具体子包路径（避免新增跨服务依赖时反复改启动类）。

**【约定】** ErrorCode：格式 `XXYYZZZ`（7 位），XX=服务编码、YY=业务模块、ZZZ=具体错误。各服务使用既定 XX 编码，禁止跨服务占用。详细规则见 [ERROR_CODE_DESIGN.md](../enum/ERROR_CODE_DESIGN.md)。

| 服务 | ErrorCode XX 编码 |
|------|-------------------|
| `system` | `10` |
| `platform` | `20` |
| `integration` | `30` |
| `hire` | `40` |
| `assess` | `50` |

**DDL 脚手架**：用户提供 DDL 生成 Entity/Mapper/Service/Controller 时，见 [DDL_SCAFFOLD.md](./DDL_SCAFFOLD.md)。

## DTO 归属

- 前端接口 DTO（Request/Response）→ 默认放 `web`
- 跨服务复用的契约 DTO → 放 `api`
- Swagger/SpringDoc 依赖、注解、配置 → 只允许放 `web`

## web 启动类标准模板

```java
@SpringBootApplication(scanBasePackages = "com.succaiss.{service}")
@MapperScan("com.succaiss.{service}.service.mapper")
@EnableFeignClients(basePackages = "com.succaiss")   // 【强制】统一扫描全包，禁止写具体子包
public class {Service}Application {
    public static void main(String[] args) {
        SpringApplication.run({Service}Application.class, args);
    }
}
```

## 禁止职责扩散

- Controller 中写核心业务、事务
- Service 中操作 HttpServletRequest
- api 中放 Entity、Mapper、Swagger
- web 中直接写 SQL 或领域规则
- utils 中塞完整业务流程
- commons 中放单业务专用代码
