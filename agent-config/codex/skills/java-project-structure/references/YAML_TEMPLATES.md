# YAML 配置模板

**何时使用**：新建微服务时，复制本文 `application.yml` 模板，替换 `{service}`、`{port}`、`{context-path}`、`{namespace}` 等占位符。Nacos 配置中心托管的内容（数据库连接串、Redis、RocketMQ）无需写入本地 yml。

---

## 服务端口约定

| 服务 | 本地端口 | context-path |
|------|---------|--------------|
| system | 10001 | `/api/v1/system` |
| platform | 10002 | `/api/v1/platform` |
| integration | 10003 | `/api/v1/integration` |
| hire | 10004 | `/api/v1/hire` |
| assess | 10005 | `/api/v1/assess` |

---

## `{service}-web/src/main/resources/application.yml`

```yaml
server:
  port: {port}                          # 见上表
  servlet:
    context-path: /api/v1/{service}     # 统一前缀

spring:
  application:
    name: {service}-service             # Nacos 注册名、Feign 调用名

  cloud:
    nacos:
      username: ${NACOS_USERNAME:nacos}
      password: ${NACOS_PASSWORD:nacos}
      discovery:
        server-addr: ${NACOS_SERVER:172.16.1.66:8848}
        namespace: ${NACOS_NAMESPACE:{namespace}}
      config:
        server-addr: ${NACOS_SERVER:172.16.1.66:8848}
        import-check:
          enabled: false                # 本地运行不强制所有 nacos 配置存在
        namespace: ${NACOS_NAMESPACE:{namespace}}
        file-extension: yaml

  config:
    import:
      - optional:nacos:env.properties   # 通用环境变量（DB URL 等）
      - optional:nacos:{service}-service
      - optional:nacos:{service}-web
      - optional:nacos:common           # 通用业务配置
      - optional:nacos:comp-redis       # Redis 连接
      - optional:nacos:comp-rocket      # RocketMQ 连接

# RocketMQ Topic 初始化（服务启动时自动创建，确保 Topic 存在）
rocketmq:
  topic-init:
    topics:
      - tp_{service}   # 服务内部事件 Topic

# SpringDoc / Swagger（默认关闭，由环境变量 SWAGGER=true 开启）
springdoc:
  api-docs:
    path: /v3/api-docs
    enabled: ${SWAGGER:false}
  swagger-ui:
    path: /swagger-ui.html
    enabled: ${SWAGGER:false}
    operations-sorter: method
    tags-sorter: alpha
    display-request-duration: true
    doc-expansion: none
    use-root-path: false
  default-consumes-media-type: application/json
  default-produces-media-type: application/json
  show-actuator: false
  show-login-endpoint: false
```

---

## 关键字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `spring.application.name` | **必须**与 Nacos 配置 Data ID 一致，Feign 通过此名路由 | `assess-service` |
| `NACOS_NAMESPACE` | 区分 dev / test / prod 环境的命名空间 UUID | `964adb89-3601-466b-9f77-c0d364f41181` |
| `NACOS_SERVER` | Nacos 地址，本地开发默认连内网 | `172.16.1.66:8848` |
| `config.import` | 按需引入，`env.properties` + 服务自身 + 公共组件 | — |
| `rocketmq.topic-init.topics` | 服务**生产**的 Topic 列表（消费的 Topic 由各 Listener 自声明） | `tp_assess` |
| `SWAGGER` | 环境变量控制，生产环境不传即为 false | `true`（开发时） |

---

## Nacos 配置中心托管内容（不写入本地 yml）

以下配置通过 `config.import` 从 Nacos 拉取，本地 `application.yml` 无需声明：

| Nacos Data ID | 内容 |
|---------------|------|
| `env.properties` | 数据库 URL、用户名密码、OSS 密钥等环境变量 |
| `comp-redis` | Redis host、port、password、database |
| `comp-rocket` | RocketMQ nameserver 地址、accessKey/secretKey |
| `common` | 公共业务开关、全局超时、分页默认值等 |
| `{service}-service` | 服务特定配置（如 AI API URL、业务超时、限流阈值） |
| `{service}-web` | Web 层特定配置（如接口白名单、文件上传大小） |

---

## 自定义业务配置示例

服务特有配置统一放在 Nacos `{service}-service` Data ID 中，本地开发可在 `application.yml` 末尾追加 fallback 默认值：

```yaml
# 示例：assess 服务的 AI 对接配置
assess:
  ai:
    base-url: ${AI_MICROSERVICE_BASE_URL:}
    generate-path: /api/v1/exam
    callback-url: ${AI_MICROSERVICE_CALLBACK_URL:https://api.succaiss.com/api/v1/assess/callback/ai}
    auth-token: ${AI_MICROSERVICE_AUTH_TOKEN:}
    connect-timeout-ms: 5000
    read-timeout-ms: 30000
```

> **约定**：自定义配置项 key 前缀使用服务名（`assess.*`、`hire.*`），避免与 Spring 内置属性冲突。
