---
name: java-controller
description: >-
  规范 Java 微服务 Controller 层的编写方式，约束协议适配层的职责边界与 REST 接口设计准则。
  涵盖：REST URL 命名、HTTP Method 选型、@RequestBody 入参、Result<VO> 出参、@RequiredArgsConstructor 注入。
  适用于：编写 Controller、REST 接口设计、URL 命名、GET/POST 使用、@RequestBody、Result 返回、接口先行。
compatibility: Java 17+, Spring Boot 3+
metadata:
  domain: java-microservice
  layer: controller
---

# Controller 规范

## 使用前置

进入本 skill 前，先过一次 `agent-guardrails`：

- 若接口目标、入参边界、返回行为不清楚，先问用户，不要脑补协议
- 若只是字段透传、小范围 URL 调整、参数绑定修复，优先做最小改动
- 不因为改 Controller 就默认重写 Service / Mapper，全链路扩散必须有直接理由
- 至少明确一种验证方式，如请求示例、参数绑定检查、返回结构检查

---

## Controller 职责边界（核心）

Controller 是**协议适配层**，方法体**不超过 3 行**：解析入参 → 调 Service → 封装出参。

```java
// ✅ 标准写法：3 行以内
@PostMapping
public Result<Long> create(@Valid @RequestBody JobConfigDTO dto) {
    return Result.ok(jobConfigService.create(dto));
}

@GetMapping("/{id}")
public Result<JobConfigVO> getById(@PathVariable Long id) {
    return Result.ok(jobConfigConvert.toVO(jobConfigService.getById(id)));
}
```

**禁止在 Controller 中**：业务逻辑判断、直接调 Mapper、数据聚合、`try-catch` 吞异常、`@Transactional`、直接返回 Entity/裸集合。

### 入参类型铁律：包装类型，禁基本类型

`@PathVariable` / `@RequestParam` 单字段、`@RequestBody` DTO 字段、`Model Attribute` 绑定字段 —— 一律用 `Long` / `Integer` / `Boolean`（金额 `BigDecimal`），**禁止 `long` / `int` / `boolean` / `double`**。与 [`java-pojo`](../java-pojo/SKILL.md) PO-07 互锁。

```java
// ✅ 正确
@GetMapping("/{id}") public Result<XxxVO> get(@PathVariable Long id) { ... }
@PostMapping("/enable") public Result<Void> enable(@RequestParam Boolean enabled) { ... }

// ❌ 错误：前端不传或传空串时基本类型直接抛 400 类型转换异常，
//    且无法配合 @NotNull 校验区分"未传"与"传 0/false"
@GetMapping("/{id}") public Result<XxxVO> get(@PathVariable long id) { ... }
@PostMapping("/enable") public Result<Void> enable(@RequestParam boolean enabled) { ... }
```

---

## 步骤：新建一个 REST 接口

1. 读 [REST_API_RULES](references/REST_API_RULES.md) 确认 URL 和 Method
2. 按以下规则设计：

   | 操作 | Method | URL 示例 |
   |------|--------|----------|
   | 创建 | POST | `/job-configs` |
   | 查单条 | GET | `/job-configs/{id}` |
   | 分页列表 | **GET** | `/job-configs` |
   | 更新 | POST | `/job-configs/update/{id}` |
   | 删除 | POST | `/job-configs/remove/{id}` |

   > **【强制】路径参数 `{id}` 必须放在路径末尾**，动作词（`update`/`remove`/`status` 等）作前缀置于参数之前。禁止 `/{id}/update`、`/{id}/status` 等将参数嵌入路径中间的写法。

3. 入参：
   - **分页/列表查询**（常规）：**`GET` + 无注解 DTO**（Model Attribute 绑定）。Spring MVC 自动将 query string 字段映射到 DTO 属性，方法体保持 1 行，**禁止改用 POST**。
   - **新增/更新**：`@Valid @RequestBody XxxDTO`
   - **极端复杂查询**（过滤字段 > 10 个或含嵌套 DTO 结构）：允许例外，改用 `POST + @RequestBody QueryDTO`，并在方法注释中说明原因。

   ```java
   // ✅ 常规分页：GET + Model Attribute（方法参数无任何注解）
   @GetMapping
   public Result<Paged<JobConfigVO>> page(JobConfigQueryDTO query) {
       return Result.ok(jobConfigService.page(query));
   }
   // 调用：GET /job-configs?current=1&size=10&status=1&keyword=Java

   // ❌ 禁止：常规分页用 POST
   @PostMapping("/page")
   public Result<Paged<JobConfigVO>> page(@RequestBody JobConfigQueryDTO query) { ... }
   ```

4. 出参：单条 `Result<XxxVO>`，分页 `Result<Paged<XxxVO>>`
5. 依赖注入用 `@RequiredArgsConstructor` + `final`（Controller 层无循环依赖风险）

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 常规分页/列表（≤ 10 个过滤字段，无嵌套结构） | **必须用 GET + 无注解 DTO**（Model Attribute 绑定），禁止改用 POST |
| 极端复杂查询（> 10 个字段或含嵌套 DTO） | 允许例外：改用 `POST + @RequestBody QueryDTO`，注释说明原因 |
| 接口返回集合（不分页） | `Result<List<XxxVO>>`；若数量不确定建议分页 |
| 入参校验失败应返回什么 | 全局异常处理器统一捕获 `MethodArgumentNotValidException`，无需在 Controller 处理 |
| 需要获取当前登录用户 | 从 `ThreadLocal`/`SecurityContext` 取，禁止从入参传 userId |
| 接口 URL 包含版本号 | 禁止路径中出现 `/v1/`；版本由网关或请求头承载 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [REST_API_RULES](references/REST_API_RULES.md) | REST 接口完整约定（URL/Method/入参/出参） |
| [XxxController.java](references/XxxController.java) | Controller 模版 |

**示例**：[UserController.java](assets/UserController.java)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# Controller 层规范（URL 命名 / HTTP 方法 / 禁注入 Mapper / Result 出参）
bash ~/cursor/skills/java-controller/scripts/check-controller.sh <模块路径>

# Controller 方法体行数 + 业务逻辑检测
python3 ~/cursor/skills/java-controller/scripts/check-controller-body.py <模块路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
