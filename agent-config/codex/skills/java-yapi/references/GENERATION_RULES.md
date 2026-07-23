# OpenAPI 生成参考（类型映射 / required 推导 / Mock 速查）

**何时使用**：写 mapping（[MAPPING_SCHEMA.md](MAPPING_SCHEMA.md)）的 `fields` / `path_params` / `query_params` 时，查 Java 类型 → OpenAPI schema 的映射规则；或需要在 mapping 中**显式覆盖**脚本默认派生的 `example` / `mock` 时，查速查表取值。

> **职责边界**：mapping 描述语义与结构；`mapping-to-openapi.py` 负责 `summary` / `tags` / `Result` 包装 / `Long → string` 转换 / `example` / `mock` 等的派生与格式化。**默认情况下 mapping 无需手写 `example` / `mock`**。
>
> 与 [MAPPING_SCHEMA.md](MAPPING_SCHEMA.md) 冲突时以后者为准。

> **核心原则**：禁止引入 springdoc/springfox 等 Swagger 运行时依赖。`yapi.json` 由脚本从 mapping 生成，同步完成后立即删除，**不纳入版本管理**。

---

## 路径截断规则（重要）

**`yapi.json` 中的路径只写 Controller 层路径，不包含服务基础路径前缀。**

YApi 项目已在服务器端配置了基础路径（如 `/api/v1/hire`），生成时无需重复：

```
# Controller 代码                         yapi.json 中的 path
@RequestMapping("/job/config")      →     /job/config
@GetMapping("/{id}")                →     /job/config/{id}
@GetMapping("/preset/names")        →     /job/config/preset/names

# 不要写成（错误）
/api/v1/hire/job/config/{id}        ←  ✗ 包含了服务基础路径
```

---

## Java 类型 → schema 推导规则

信息源优先级：**Javadoc > 方法签名推断**（禁止使用 `@Tag` / `@Operation` 等 Swagger 运行时注解）

| 源码元素 | 推导为 |
|----------|--------|
| 类 Javadoc 首行 | `tags[].name` |
| 方法 Javadoc 首行 | 路径条目的 `summary`（须符合「业务名称 - 操作」格式） |
| `@RequestMapping("/job/config")` | paths 路径前缀（不含服务基础路径） |
| `@GetMapping("/{id}")` | `GET /job/config/{id}` |
| `@PostMapping` / `@PutMapping` / `@PatchMapping` / `@DeleteMapping` | 对应 HTTP method |
| 方法 Javadoc `@param xxx 说明` | 参数 `description` |
| `@PathVariable Long id` | `parameters[in=path, required=true]` |
| `@RequestParam(required=false)` | `parameters[in=query, required=false]` |
| `@RequestParam(defaultValue="1")` | `parameters[in=query]` + `default` |
| `@RequestBody XxxDTO` | `requestBody` + DTO 字段结构 |
| `Result<XxxVO>` 返回值 | `responses.200` + VO 字段结构 |
| `Result<Paged<XxxVO>>` | 分页结构响应体 |
| `Result<Long>` | data 类型为 `string`（Long 序列化为字符串） |
| `Result<Void>` | data 为 `null` |
| DTO/VO 字段 `Long` 类型 | schema type `string`（防前端精度丢失） |
| DTO/VO 字段 `LocalDateTime` | schema type `string`, format `date-time` |
| DTO/VO 字段 `Map<String, V>` | schema type `map`；若 key 取值有限，必须显式写 `keys` |

### `Map<String, V>` 生成规则

YApi 对 JSON Schema 的 `additionalProperties` 展示不友好，页面常看起来像空对象。因此：

- key 集合有限时，必须使用 `type: map` + `keys`，例如题型分组 `choice / blank / game / code / bq`。
- key 集合开放时，才使用 `type: map` 且省略 `keys`，脚本会输出标准 `additionalProperties`。
- `values` 描述 Map value 类型，可写基础类型、schema 名，或 `{ type: array, items: XxxVO }`。

---

## Mock 数据规则

`mapping-to-openapi.py` 会按 `name + type` 派生 `example` 与 `mock`（如 `phone` → `13800138000`、`email` → `user@example.com`、`Long` → `@string('number', 18)`），mapping 一般无需手写。

仅当默认派生不满足业务展示需要（如特定字典值、特殊格式占位）时，才在 mapping 的 `field` 上显式提供 `example` 或 `mock`：

| 字段 | 作用 | 格式 |
|------|------|------|
| `example` | 标准 OpenAPI 字段，用于文档展示和请求示例填充 | 具体值或 Mockjs 占位符字符串 |
| `mock` | YApi JSON-Schema 专有扩展，驱动 Mock 服务动态生成数据 | `{"mock": "@占位符"}` 对象 |

### Mock 值速查表（`mapping-to-openapi.py` 内置策略，与下表一致；手写覆盖时按此表取值）

| Java 类型 / 语义 | schema type | `example` | `mock` |
|------------------|-------------|-----------|--------|
| Long（雪花 ID） | `string` | `"1947283920182378496"` | `{"mock": "@string('number', 18)"}` |
| Long（普通数字） | `string` | `"123456"` | `{"mock": "@string('number', 6)"}` |
| String（中文名） | `string` | `"张伟"` | `{"mock": "@cname"}` |
| String（中文标题/名称） | `string` | `"高级Java工程师"` | `{"mock": "@ctitle(4, 8)"}` |
| String（日期时间） | `string` | `"2024-03-21 10:30:00"` | `{"mock": "@datetime('yyyy-MM-dd HH:mm:ss')"}` |
| String（日期） | `string` | `"2024-03-21"` | `{"mock": "@date('yyyy-MM-dd')"}` |
| String（手机号） | `string` | `"13800138000"` | `{"mock": "@string('number', 11)"}` |
| String（邮箱） | `string` | `"zhangwei@example.com"` | `{"mock": "@email"}` |
| String（URL） | `string` | `"https://example.com/file.jpg"` | `{"mock": "@url"}` |
| String（IP） | `string` | `"203.0.113.10"` | `{"mock": "@ip"}` |
| String（枚举描述） | `string` | `"已发布"` | `{"mock": "已发布"}`（固定值） |
| Integer（枚举码） | `integer` | `1` | `{"mock": 1}`（取第一个合法枚举码） |
| Integer（数量） | `integer` | `42` | `{"mock": "@integer(1, 100)"}` |
| Boolean | `boolean` | `true` | `{"mock": "@boolean"}` |
| BigDecimal / Double | `number` | `12500.00` | `{"mock": "@float(1000, 50000, 2, 2)"}` |
| Result.code（成功） | `integer` | `0` | `{"mock": 0}` |
| Result.message | `string` | `"success"` | `{"mock": "success"}` |
| 分页 total | `integer` | `100` | `{"mock": 100}` |
| 分页 pageNum | `integer` | `1` | `{"mock": 1}` |
| 分页 pageSize | `integer` | `10` | `{"mock": 10}` |

---

## 必填字段（required）规则

**两处 `required` 含义不同，必须正确区分：**

### ① parameters 参数级 `required`（布尔值）

写在 parameter 对象上，表示该参数是否必传：

| 参数位置 | `required` 值 | 说明 |
|----------|--------------|------|
| `in: path` | `true` | 路径参数永远必填 |
| `in: query` | 按实际业务 | 有 `@RequestParam(required=true)` 或无 `required=false` 时为 `true`，否则为 `false` |

```json
{ "name": "id",     "in": "path",  "required": true,  ... }
{ "name": "status", "in": "query", "required": false, ... }
```

### ② schema 对象级 `required`（字段名数组）

写在 DTO/VO 的 schema 对象上，列出所有必填属性名：

- **DTO（请求体）**：字段有 `@NotNull` / `@NotBlank` / `@NotEmpty` → 加入 `required` 数组
- **VO（响应体）**：通常无需 `required`，服务端保证字段存在
- **requestBody 本身**：POST/PUT 方法的请求体固定写 `"required": true`

```json
"UserDTO": {
  "type": "object",
  "required": ["name", "status"],
  "properties": {
    "name":   { "type": "string",  "description": "用户名（必填）" },
    "remark": { "type": "string",  "description": "备注（选填）" }
  }
}
```

**推导来源对照：**

| Java 注解 | 是否加入 `required` 数组 |
|-----------|--------------------------|
| `@NotNull` | 是 |
| `@NotBlank` | 是 |
| `@NotEmpty` | 是 |
| 无注解 / `@Nullable` | 否（选填） |
