# 枚举模版说明

**何时使用**：编写/优化业务枚举、错误码时。
**如何使用**：模版参考本目录；ErrorCode 详细设计见 [ERROR_CODE_DESIGN.md](./ERROR_CODE_DESIGN.md)，服务归属与分层见 [PROJECT_STRUCTURE.md](../project-structure/PROJECT_STRUCTURE.md)。

本目录包含两类枚举模版：

| 模版 | 用途 | 实现接口 |
|------|------|----------|
| XxxEnum | 多值字段（type/status 等） | BaseEnum<Integer, String> |
| XxxErrorCode | 领域错误码 | ErrorCode |

**【强制】** ErrorCode 实现 `ErrorCode` 接口，禁止自造 BizCode/BizException。格式 `XXYYZZZ`（7 位）。

5 个微服务 `XX` 固定编码如下：

| 服务 | XX |
|------|----|
| `system` | `10` |
| `platform` | `20` |
| `integration` | `30` |
| `hire` | `40` |
| `assess` | `50` |

详细规则见 [ERROR_CODE_DESIGN.md](./ERROR_CODE_DESIGN.md)。
