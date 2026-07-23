---
name: java-pojo
description: >-
  规范 Java 微服务中 Entity、DTO、VO 三类 POJO 的职责边界、字段约定与 Lombok / MyBatis-Plus 注解使用方式。
  涵盖：Entity（数据库实体）、DTO（服务间/MQ 传输对象）、VO（接口返回视图对象）的设计原则与泛型 VO 规范。
  适用于：新建 Entity、DTO、VO、Request、Response 类，实体类设计，数据对象分层，@TableName、@TableField 使用，字段定义，Lombok @Data 注解。
compatibility: Java 17+, Spring Boot 3+, MyBatis-Plus 3+, Lombok
metadata:
  domain: java-microservice
  layer: pojo
---

# POJO 规范（Entity / DTO / VO）

---

## 如何选择类型

```
有新业务字段需要定义？
├── 映射数据库表字段 → Entity（放 {service}-service/entity）
├── 其他服务通过 Feign 消费（跨服务契约）→ DTO（放 {service}-api）
├── 本服务内部使用，service 层和 web 层都要用 → DTO（放 {service}-service/dto）
├── 仅 web 层使用 → DTO/Request（放 {service}-web）
└── Controller 出参给前端 → VO（放 {service}-web 或 {service}-service）
```

**判断原则**：谁消费，谁决定类型。前端消费 → VO；其他服务消费 → DTO（放 api）；仅本服务消费 → DTO（放 service 或 web）；数据库消费 → Entity。

**`api` 层核心约定**：`{service}-api` 只给**其他服务**通过 Feign 消费。功能的入口在本服务时，不需要在 `api` 层暴露任何东西，前端 DTO 放 `service` 或 `web`。

---

## 字段类型铁律：**禁止任何基本类型，必须用包装类型**

POJO（Entity / DTO / VO / Request / Response）的非 `final` 字段、以及 RPC/接口的入参出参，**一律使用包装类型**（`Long` / `Integer` / `Boolean` / `Character` / `Double` / `BigDecimal` …），**禁止 `byte` / `short` / `int` / `long` / `float` / `double` / `boolean` / `char` 等基本类型**。

| 类别 | 推荐 | 禁止 |
|---|---|---|
| 整数 | `Byte` / `Short` / `Integer` / `Long` | `byte` / `short` / `int` / `long` |
| 布尔 | `Boolean` | `boolean` |
| 浮点 | `BigDecimal`（金额必用）/ `Double` | `float` / `double`（金额禁用） |
| 字符 | `Character` / `String` | `char` |

**为什么**：

1. **「未传」与「业务有效值」可区分**——基本类型有默认值（`int = 0`、`boolean = false`），收到 `0`/`false` 时无法判断是用户主动传入还是没传；包装类型用 `null` 明确表达「未设置」
2. **数据库 NULL 直映**——查询结果含 NULL 时基本类型会抛 NPE 或被误转为 0
3. **JSON 序列化语义清晰**——`null` 字段不会被序列化，前端能区分 `false` 与「未返回」
4. **避免 `boolean isXxx` 的 Lombok + Jackson 序列化丢 `is` bug**（详见 `java-code-review` CR-17）：`boolean isActive` 经 Lombok 生成 `isActive()`，Jackson 反射后属性名变成 `active`，与字段名不一致；改用 `Boolean` 装箱后 Lombok 生成 `getIsActive()`，序列化 key 仍是 `isActive`，无此问题

```java
// ✅ 正确
@Data
public class JobConfigDTO {
    private Long id;
    private Integer type;
    private Boolean enabled;
    private Boolean isDemoMode;     // Boolean 装箱，is 前缀安全
    private Character level;
    private BigDecimal salary;
}

// ❌ 错误：基本类型 + Lombok 会引入 Jackson 序列化 bug 与「无法区分未传」的歧义
@Data
public class JobConfigDTO {
    private long id;                // ← 数据库 NULL 时 NPE
    private int type;               // ← 收到 0 不知道是「未传」还是「类型 = 0」
    private boolean enabled;        // ← Jackson key 变 "enabled"，与字段名 isEnabled 类似场景全错位
    private boolean isDemoMode;     // ← 同上：序列化 key 变成 "demoMode"，与跨服务契约不符
    private char level;             // ← 字符默认值 \u0000 无法表达「未设置」
    private double salary;          // ← 金额禁用浮点
}
```

**例外（极少数）**：

- 局部变量、循环计数器、私有方法返回值 —— 不属于 POJO 字段，可用基本类型
- `final` 字段、`static final` / `final static` 常量（如 `serialVersionUID`、常量上限值）—— 不按 POJO 业务字段处理
- 数组字段 —— 不纳入本规则
- 性能敏感的高频内部数据结构（缓存、计算中间状态）—— 在确有性能数据支持时可用基本类型，但需注释说明

---

## 步骤：新建 Entity

1. 继承 `BaseEntity`（已含 id/createdAt/updatedAt/createdBy/updatedBy，**禁止重声明**）
2. 注解顺序固定：

   ```java
   @Data
   @Accessors(chain = true)
   @ToString(callSuper = true)
   @EqualsAndHashCode(callSuper = true)
   @TableName("job_config")
   public class JobConfigEntity extends BaseEntity {
       /** 职位名称 */
       private String name;
       /** 职位类型，见 {@link JobTypeEnum} */
       private Integer type;
   }
   ```

3. 字段名用驼峰，自动映射下划线列名；保留字（如 `key`/`order`）加 `@TableField("column_name")`
4. 逻辑删除字段用 `@TableLogic`（通常已在 `BaseEntity` 中配置）

---

## 步骤：新建 DTO

1. 先判断归属（见上方三分法）：跨服务契约放 `{service}-api`，本服务 service+web 都用放 `{service}-service`，仅 web 用放 `{service}-web`
2. Create/Update 字段重合时**合并为一个 DTO**，不拆 `CreateDTO`/`UpdateDTO`
3. 必填字段加 JSR-303 注解：

   ```java
   @Data
   public class JobConfigDTO implements Serializable {
       private Long id;                               // update 必填，create 由系统生成
       @NotBlank(message = "职位名称不能为空")
       private String name;
       @NotNull(message = "职位类型不能为空")
       private Integer type;
   }
   ```

---

## 步骤：新建 VO

1. **只放前端需要的字段**，不复制 Entity 的所有字段
2. 禁止包含：`is_deleted`、密码、内部流转字段
3. 枚举字段额外暴露 `xxxDesc`（中文描述）：

   ```java
   @Data
   public class JobConfigVO {
       private Long id;
       private String name;
       private Integer type;
       private String typeDesc;   // 职位类型描述，如"全职"
       private String createTime; // 格式化后的时间字符串
   }
   ```

---

## 第三方服务 / AI 响应 VO（泛型规范）

### 核心禁令

**严禁**用 `Object`、`JsonNode`、`Map` 作为字段类型来承载结构化数据。  
无论是 Controller 出参还是第三方 API 响应包装，**所有嵌套结构必须用具名 DTO 定义**，消费方才能明确知道里面有什么字段。

### 当响应有多个变体时 → 泛型 VO

第三方 AI 服务常见"同一外层包装、内层载荷因业务类型不同"的模式，使用泛型统一包装：

```java
// 泛型包装（在 *-api 的 vo/ 包中）
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class XxxResultVO<T> {
    private Integer code;
    private String msg;
    private Payload<T> data;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Payload<T> {
        private String businessId;
        private T data;        // 具体载荷，类型由外层泛型参数决定
    }
}

// 每种变体各自的载荷 DTO（同 vo/ 包下）
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class XxxExamResultData { /* 出题载荷字段 */ }

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class XxxScoreResultData { /* 评分载荷字段 */ }
```

消费方使用：`XxxResultVO<XxxExamResultData>`，所有字段均有强类型。

### Jackson 泛型反序列化 → 必须用**显式** TypeReference

```java
// ✅ 正确：显式声明完整泛型，Jackson 运行时可捕获
return objectMapper.readValue(json,
        new TypeReference<XxxResultVO<XxxExamResultData>>() {});

// ❌ 错误：diamond <> 在匿名类中无法保留泛型信息，Jackson 会退化为 Map
return objectMapper.readValue(json, new TypeReference<>() {});
```

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 前端 DTO 该放哪个模块 | service+web 都用 → `{service}-service/dto`；仅 web 用 → `{service}-web`；其他服务 Feign 调用 → `{service}-api` |
| Entity 字段名与 MySQL 保留字冲突 | `@TableField("order")` 显式映射 |
| DTO 需要在多个场景复用但字段略有差异 | 优先共用一个 DTO + `@JsonView` 分组；场景差异大时才拆子类 |
| VO 要返回枚举的中文名 | 在 Convert 中用枚举的 `getDesc()` 填充 `xxxDesc` 字段 |
| text 字段存储 JSON 结构 | 不用 `String` 直接存；生成对应 JSON DTO，Entity 字段 Javadoc 用 `{@link XxxDTO}` 标注 |
| 跨服务传输的 DTO 需要向后兼容 | 只增字段，不改字段名；删除字段需协调消费方版本 |
| 第三方 API 响应内层含结构化数据 | 禁止用 `Object`/`JsonNode`/`Map`；定义具名载荷 DTO，多变体时用泛型 VO |
| Jackson 反序列化泛型 VO | 必须用显式 `new TypeReference<XxxResultVO<XxxData>>() {}`，禁止用 diamond `<>` |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [XxxEntity.java](references/XxxEntity.java) | Entity 模版 |
| [XxxDTO.java](references/XxxDTO.java) | DTO 模版 |
| [XxxVO.java](references/XxxVO.java) | VO 模版 |
| [README](references/README.md) | 详细职责说明与约定 |

**示例**：[UserEntity.java](assets/UserEntity.java) · [UserDTO.java](assets/UserDTO.java) · [UserVO.java](assets/UserVO.java)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# POJO 边界（VO 含 is_deleted / Entity 混展示字段 / 重复公共字段 / api 层 DTO 无参构造）
bash ~/cursor/skills/java-pojo/scripts/check-pojo.sh <模块路径>

# Convert 字段对齐 + DTO/VO 字段重复率检查
# PO-AL：Entity/DTO/VO 字段在 Convert 中遗漏映射 / @Mapping 引用不存在的字段
# PO-DUP：两个 DTO/VO 字段重复率 ≥ 90%（或 Create/Update 命名变体重复率 ≥ 70%）时提示合并
python3 ~/cursor/skills/java-pojo/scripts/check-dto-entity-alignment.py <模块路径>

# Lombok 规范（@Builder 误用 / 注解顺序 / @SneakyThrows / @Accessors(chain=true) 误用 / @FieldDefaults 等）
bash ~/cursor/skills/java-code-review/scripts/check-lombok.sh <模块路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
