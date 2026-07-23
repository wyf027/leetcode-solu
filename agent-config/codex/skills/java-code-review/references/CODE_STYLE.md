# 代码风格规范

**何时使用**：优化/重构/编写 Java、代码评审时必读。

每项以「约定」为单位，附正例/反例。

---

## 〇、全局约定

| 约定 | 说明 |
|------|------|
| 优先复用 | 先查项目内、依赖库、JDK、Spring；有 common-base 必须复用 BaseEnum、ErrorCode、BusinessException、ResultStatus、Result |
| 禁止平行协议 | 禁止 BizException、BizCode、散落 200/500、自定义 success()/fail() |
| 领域约束 | 本域用 Mapper，跨域调 Service；跨服务只依赖 *-api |
| 封装思想 | 单一职责、高内聚低耦合；面向抽象，依赖接口；对外稳定契约、对内封装；禁止泄漏 Mapper/DB/实现细节到上层 |

```java
// 正例
throw UserErrorCode.USER_NOT_FOUND.toEx();
return Result.ok(data);
return Result.fail(UserErrorCode.USER_NOT_FOUND);
// 本域 Mapper，跨域 Service
@Resource
private OrderMapper orderMapper;
// 跨域调 Service，不注入对方 Mapper
@Resource
private UserService userService;

// 反例
throw new RuntimeException("用户不存在");
public interface BizCode { Integer getCode(); String getMessage(); }
// 禁止：OrderService 注入跨域 Mapper，应改用 UserService
@Resource
private UserMapper userMapper;
// DTO 泄漏 DB 字段
public class OrderDTO {
    private String orderTableName;  // 实现细节
}
```

---

## 一、命名约定

| 约定 | 说明 |
|------|------|
| 简洁清晰 | 命名简洁易懂，优先业务词，≤4 词，业务对象+动作/角色，避免堆砌实现/流程细节 |
| 大小写 | 类 UpperCamelCase，方法/变量 lowerCamelCase，常量全大写下划线 |
| 禁止 | 拼音、不规范缩写、下划线开头；POJO 字段使用任何基本类型（`Boolean` 装箱类型可保留 `isXxx`，无序列化风险） |

### 字段类型铁律（POJO / 接口入参 / 枚举 code）

POJO（Entity / DTO / VO / Request / Response）字段禁止任何基本类型；Controller `@PathVariable`/`@RequestParam`/`@RequestBody` 入参、`BaseEnum` & `ErrorCode` 的 `code` 字段，**一律包装类型**。

| 类别 | ✅ | ❌ |
|---|---|---|
| 整数 | `Byte` / `Short` / `Integer` / `Long` | `byte` / `short` / `int` / `long` |
| 布尔 | `Boolean` | `boolean` |
| 浮点（金额） | `BigDecimal`（金额必用） | `float` / `double` |
| 字符 | `Character` / `String` | `char` |
| 时间 | `LocalDateTime` | `Date` / `long` 毫秒 |

理由：①「未传」与「业务 0/false」可区分（`null` 表达「未设置」）；②数据库 NULL 直映不 NPE；③Lombok+Jackson 对 `boolean isXxx` 会丢 `is` 与字段名错位（详见 CR-17）；④Feign / RPC 跨服务边界对包装类型友好。

例外：局部变量、循环计数器、私有方法返回值，**不属于 POJO 字段**，可用基本类型；`final` 字段、`serialVersionUID`、常量上限值等 `static final` / `final static` 常量可用基本类型；数组字段不纳入本规则。

跨 skill 互锁：[`java-pojo`](../../java-pojo/SKILL.md) PO-07 · [`java-database`](../../java-database/SKILL.md) DDL 映射表 · [`java-enum`](../../java-enum/SKILL.md) code 字段 · [`java-controller`](../../java-controller/SKILL.md) 入参 · [`java-code-review`](../SKILL.md) CR-17/CR-19。

```java
// 正例
public class UserService {}
String buildToken() {}
List<UserDTO> queryUsers() {}
int[] arr = new int[10];             // 局部变量允许
private static final int MAX_STOCK = 100;  // static final 常量允许
private final static int MIN_STOCK = 0;    // final static 常量允许
private Boolean deleted;
private Boolean isDemoMode;       // 装箱类型 + Lombok @Data 生成 getIsDemoMode()，Jackson 序列化字段名仍是 isDemoMode，安全
private Character level;
private final int retryTimes = 1;  // final 字段不纳入本规则

// 反例
String _name;
int DaZhePromotion;
String buildUserLoginTokenForMobileClient() {}
Integer queryUserOrderListByPageAndStatus() {}
String fmtPh() {}
String args[];
boolean isDeleted;  // 原始类型 + Lombok 生成 isDeleted() → Jackson 反射识别属性为 deleted，丢失 is，与字段名不一致
private char level;
```

---

## 二、格式约定

| 约定 | 说明 |
|------|------|
| 行宽/方法 | 单行≤120，方法≤80 行，4 空格缩进 |
| 括号 | 左括号不换行，右括号不单独成行 |
| 大括号 | 禁止省略 {}，单行亦然 |
| 逻辑块 | 逻辑块间空一行，逗号后空格 |

```java
// 正例
if (flag == 0) {
    doSomething();
}
public void process() {
    if (dto == null) {
        return;
    }

    User user = userMapper.getById(dto.getId());
    return buildResult(user);
}
method(args1, args2, args3);
public void save(Long id, String name) {
}

// 反例
if (cond) return;
for (int i = 0; i < 10; i++) doSomething(i);
method(a,b,c);
public void save(Long id, String name
) {
}
```

---

## 三、常量与枚举约定

| 约定 | 说明 |
|------|------|
| type/status 建枚举 | 实现 BaseEnum，Entity 注释 `{@link XxxEnum}` |
| 错误码实现 ErrorCode | `throw XxxErrorCode.XXX.toEx()` |
| 禁止魔法值比较 | 禁止 `== 1`，用 `BaseEnum.eq()` 或 `BaseEnum.of()` |
| Long 后缀 | 用大写 L，禁止小写 l |

```java
// 正例
/** 订单状态，见 {@link OrderStatusEnum} */
private Integer status;

public enum OrderStatusEnum implements BaseEnum<Integer, String> {
    PENDING(0, "待处理"),
    PAID(1, "已支付");
    private final Integer code;
    private final String desc;
}
if (OrderStatusEnum.PAID.eq(order.getStatus())) {}
if (BaseEnum.of(code, OrderStatusEnum.class) != null) {}

Long a = 2L;

// 反例
private Integer status;  // 无枚举映射
if (order.getStatus() == 1) {}  // 魔法值比较
Long a = 2l;  // 易与 1 混淆
```

---

## 四、控制语句约定

| 约定 | 说明 |
|------|------|
| 大括号 | 同格式约定，禁止省略 {} |
| switch | 必须有 default；if-else≤3 层；优先正向、卫语句 |

```java
// 正例
if (dto == null) {
    return;
}
if (x < 100) {
    // ...
}

// 反例
if (cond) return;
switch (x) { case 1: ... }  // 无 default
if (!(x >= 100)) { ... }    // 取反难读
```

---

## 五、OOP 与封装约定

| 约定 | 说明 |
|------|------|
| 重复逻辑 | 提取方法，禁止复制粘贴 |
| 复杂分支 | 采用策略模式 |
| getter/setter | 无业务逻辑 |
| 循环拼接 | 用 StringBuilder |

```java
// 正例
private boolean isValidOrder(OrderEntity order) {
    return order != null && OrderStatusEnum.PAID.eq(order.getStatus());
}
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 100; i++) {
    sb.append("x");
}

// 反例
public void processA(Order order) {
    if (order != null && order.getStatus() == 1) return;  // 魔法值 + 重复
}
public Integer getData() {
    return condition ? data + 100 : data - 100;  // getter 含业务
}
for (int i = 0; i < 100; i++) { str = str + "x"; }  // 应 StringBuilder
```

---

## 六、集合约定

| 约定 | 说明 |
|------|------|
| 判空 | isEmpty，不用 size() == 0 |
| toArray | 必须带参 `new String[0]` |
| Arrays.asList | 不可修改，禁止 add/remove |
| toMap | 需 mergeFunction，value 非 null |

```java
// 正例
if (list.isEmpty()) {}
String[] arr = list.toArray(new String[0]);

// 反例
if (list.size() == 0) {}
list.toArray();  // 强转易 ClassCastException
Arrays.asList("a", "b").add("c");  // UnsupportedOperationException
```

---

## 七、Lombok 与依赖注入约定

| 约定 | 说明 |
|------|------|
| Controller | 可用 @RequiredArgsConstructor + final |
| Service | **禁止** @RequiredArgsConstructor（易循环依赖），必须 @Resource |
| 统一 | 禁止 @Autowired，使用 @Resource |
| POJO | 同时需要 getter+setter 时用 @Data；有继承加 @ToString/@EqualsAndHashCode(callSuper=true)；无默认值，构造无业务逻辑 |
| 构造方法 | 有业务逻辑/校验/副作用的构造方法不得用 Lombok 自动生成替代 |

```java
// 正例：Controller
@RestController
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;
}

// 正例：Service
@Service
public class OrderService {
    @Resource
    private OrderMapper orderMapper;
}

// 正例：POJO
@Data
public class OrderDTO {
    private Long id;
    private String name;
}

// 反例：Service 用构造注入导致循环依赖
@Service
@RequiredArgsConstructor
public class OrderService {
    private final UserService userService;  // 循环时启动失败
}

// 反例：有继承缺 callSuper
@Data
public class UserEntity extends BaseEntity {
    // 缺 @ToString(callSuper=true) @EqualsAndHashCode(callSuper=true)
}
```

---

## 八、日期约定

| 约定 | 说明 |
|------|------|
| 年份 | 用 yyyy，禁止 YYYY（跨年错误） |
| 时间戳 | currentTimeMillis |
| 天数 | 不写死 365，用 LocalDate.lengthOfYear() |

```java
// 正例
new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
long ts = System.currentTimeMillis();
int days = LocalDate.now().lengthOfYear();

// 反例
new SimpleDateFormat("YYYY-MM-dd");  // 跨年错误
new Date().getTime();
int[] days = new int[365];  // 闰年错误
```

---

## 九、日志约定

| 约定 | 说明 |
|------|------|
| 职责与分层 | 记录运行态；注释写静态，日志写动态，互补不替代；DAO 不打业务日志，由 Service 记录 |
| 门面/占位符 | SLF4J/@Slf4j；用 `{}`，禁止 `+` 拼接 |
| **【铁律】统一三段式（无任何豁免）** | **所有 `log.info/warn/error/debug` 一律按 `"业务名 - 操作 - 操作结果: key = {}, key2 = {}"` 格式**：启动初始化、Configuration、工具类静态方法、Filter/Listener、异常处理器**全部不豁免**；`业务名` / `操作` / `操作结果` 三段**必须为简洁中文短语**（如 `订单`/`网关`/`MQ`/`异步任务`、`创建`/`初始化JwtDecoder`/`发送消息`、`开始`/`成功`/`失败`/`跳过`/`命中缓存` 等，业务化原因短语自由表达） |
| **【强制】kv 的 key 用英文** | **kv 的 key 必须为英文标识符且与代码中变量名一致**（便于 `grep` 定位与排查）：`"订单 - 创建 - 成功: orderId = {}, userId = {}"`，禁止 `"订单 - 创建 - 成功: 订单号 = {}"` |
| **【强制】业务标识** | **每条日志必须携带至少一个业务标识或上下文 kv**（如 id、name、code、bean、order 等），禁止打印无上下文的纯文字描述日志（如仅 `log.info("初始化 - 完成")` 必须补 kv） |
| 异常日志 | 异常 e 放最后参数：`log.error("业务 - 操作 - 失败: param = {}", param, e)` |
| 禁止 | System.out、e.printStackTrace()、JSON 打对象 |
| 级别 | error 系统异常；warn 用户错误；info 关键流程；debug 生产禁止 |
| 异常分层 | Service 不向 Web 抛 checked Exception；业务异常统一 BusinessException + ErrorCode |

```java
// 正例：三段式中文 + 英文 kv key
@Slf4j
@Service
public class OrderService {
    public Long create(OrderDTO dto) {
        log.info("订单 - 创建 - 开始: userId = {}", dto.getUserId());
        // 业务逻辑
        log.info("订单 - 创建 - 成功: orderId = {}", orderId);
        return orderId;
    }
}

// 正例：跳过/忽略场景必须带出被跳过的业务对象标识
for (TagDTO tag : tagList) {
    if (StringUtils.isBlank(tag.getName())) {
        log.warn("标签 - 处理 - 名称为空: tagId = {}", tag.getId());
        continue;
    }
}

// 正例：异常日志（e 作为最后参数，不加占位符）
try {
    paySvc.charge(orderId);
} catch (Exception e) {
    log.error("订单 - 支付 - 失败: orderId = {}", orderId, e);
    throw e;
}

// 反例：业务名/操作用英文（CR-07a 报错）
log.info("create order - start: userId = {}", dto.getUserId());

// 反例：kv 的 key 用中文（CR-07g 报错，无法 grep 变量名）
log.info("订单 - 创建 - 成功: 订单号 = {}", orderId);

// 反例：无业务标识的纯文字描述，无法定位是哪条数据
log.warn("标签名为空，跳过");
log.info("任务执行完毕");
log.error("保存失败");

// 反例：DAO 层打业务日志
@Mapper
public interface OrderMapper {
    @Insert("...")
    int insert(OrderEntity e);
    // 禁止在 Mapper/XML 中 log
}

// 反例
logger.info("id:" + id);
System.out.println("debug");
e.printStackTrace();
logger.info("order={}", JSON.toJSONString(order));
```

---

## 十、注释约定

| 约定 | 说明 |
|------|------|
| 类/方法/字段 | 类 @author、@since；方法 @param、@return、@throws；字段简要说明，多值引用 `{@link XxxEnum}` |
| AI 署名 | @author 涉及 AI 生成时，格式为 `${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})`，变量来源见下表 |
| 位置 | 行上方，禁止行尾 |
| 方法内 | 业务方法内部以 `// 1. xxx` 格式标注关键节点（校验/查询/计算/状态变更/发消息），逻辑块间空一行；注释写意图，运行态由日志记录 |

**变量来源（生成代码前必须获取）**：

| 变量 | 来源 | 获取方式 |
|------|------|---------|
| `${AUTHOR_NAME}` | Git 用户名 | `git config user.name` |
| `${TOOL_NAME}` | 当前 IDE/工具名称 | 如 `Cursor`、`IntelliJ IDEA` |
| `${MODEL_NAME}` | 当前 AI 模型名称 | 如 `claude-4-opus`、`gpt-4o` |
| `${DATE}` | 当前日期 | 格式 `yyyy/MM/dd` |

```java
// 正例
/**
 * 订单服务
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
public class OrderService {}

/** 订单状态，见 {@link OrderStatusEnum} */
private Integer status;

/**
 * @param id 订单 ID
 * @return 订单信息，不存在返回 null
 */
public Order getById(Long id) {}

// 正例：方法内关键节点步骤注释
public Long createPaper(PaperSaveDTO dto) {
    // 1. 参数校验
    if (dto == null || dto.getJobId() == null) {
        throw AssessErrorCode.PARAM_INVALID.toEx();
    }

    // 2. 查询关联职位，校验存在性
    JobConfigDTO job = jobConfigService.getById(dto.getJobId());
    if (job == null) {
        throw AssessErrorCode.JOB_NOT_FOUND.toEx();
    }

    // 3. 构建试卷实体并保存
    PaperEntity paper = paperConvert.toEntity(dto);
    paperMapper.insert(paper);

    // 4. 发布试卷生成消息
    RocketMqUtil.send(MqConst.PAPER_CREATED_TOPIC, paper.getId());

    return paper.getId();
}

// 反例：无步骤注释，逻辑块堆叠，意图不明
public Long createPaper(PaperSaveDTO dto) {
    if (dto == null || dto.getJobId() == null) {
        throw AssessErrorCode.PARAM_INVALID.toEx();
    }
    JobConfigDTO job = jobConfigService.getById(dto.getJobId());
    if (job == null) {
        throw AssessErrorCode.JOB_NOT_FOUND.toEx();
    }
    PaperEntity paper = paperConvert.toEntity(dto);
    paperMapper.insert(paper);
    RocketMqUtil.send(MqConst.PAPER_CREATED_TOPIC, paper.getId());
    return paper.getId();
}

// 反例：缺少 Javadoc、字段无说明、行尾注释（禁止）、逻辑块间无注释无空行
public class OrderService {}
private Integer status;
public Order getById(Long id) {}
private Long id;  // 禁止：行尾注释，应移至行上方
// 逻辑块间无注释、无空行
public void process() {
    if (dto == null) return;
    User u = mapper.getById(dto.getId());
    return build(u);
}
```

---

## 十一、入参出参约定

| 约定 | 说明 |
|------|------|
| 入参出参 | Entity/DTO（≥3 参数用 DTO）；Web 用 VO，非 Web 用 DTO；转换优先 MapStruct |
| 一表复用 | Create/Update 重合用 XxxDTO；列表查询参数对应 DTO 字段 + @RequestParam，不用 XxxListDTO |
| 保护 | 集合 size、ID 范围校验；返回 null 需注释 |

```java
// 正例：Create/Update 复用 DTO
Long create(UserDTO dto);
void update(Long id, UserDTO dto);

PageResult<UserDTO> list(Integer pageNum, Integer pageSize, String name, Integer status);
UserVO getById(Long id);
if (ids != null && ids.size() > 500) {
    throw new IllegalArgumentException();
}
/** @return 不存在时返回 null */
UserDTO getById(Long id);

// 反例
void update(Long id, String name, Integer status, Date time);  // 多参数
List<User> list(Map<String, Object> params);                    // Map 入参
List<User> listByIds(List<Long> ids);                           // 无 size 限制
```

---

## 十二、审查清单

- [ ] 全局：复用 common-base，无平行协议
- [ ] 命名：≤4 词，无拼音/缩写
- [ ] 格式：括号、大括号、空行
- [ ] 枚举：type/status 建 BaseEnum，无魔法值比较
- [ ] 控制：不省略 {}，switch 有 default
- [ ] OOP：重复提取，复杂用策略
- [ ] Lombok：Controller 可构造注入，Service 必 @Resource
- [ ] 集合/日期/日志：符合约定，DAO 不打业务日志，每条日志携带业务标识（id/name/code 等）
- [ ] 注释：类/方法/字段 Javadoc；方法内关键节点有 `// 1. xxx` 步骤注释，逻辑块间空一行
- [ ] 入参出参：DTO/VO 分层，MapStruct 转换
