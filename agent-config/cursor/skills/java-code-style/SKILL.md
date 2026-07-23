---
name: java-code-style
description: |
  Java 代码风格规范（阿里嵩山版）。涵盖：全局约束、命名、格式、常量、枚举（含枚举判断约束）、控制、OOP、封装、集合、日期、日志、抽象层、POJO、入参出参、注释。
  适用于：编写/评审 Java 代码、日志规范、代码风格相关场景。
---

# Java 代码风格规范

基于阿里巴巴 Java 开发手册（嵩山版），每项先简要说明，再正例/反例。

---

# 〇、全局约束

**【强制】** 禁止重复造轮子。新增前先查询（项目内、依赖库、JDK、Spring 等）是否已有实现，优先复用；无可用时再新增。

---

# 一、命名

类 UpperCamelCase，方法/变量 lowerCamelCase，常量全大写下划线，包名小写单数，数组[]紧挨类型。禁止拼音、不规范缩写。

```java
// 正例
public class UserService {}
int[] arr = new int[10];
private static final int MAX_STOCK_COUNT = 100;
String getHttpMessage() {}
package com.alibaba.util;

// 反例
// 下划线开头
String _name;
// 拼音混用
int DaZhePromotion;
// [] 应在类型后
String args[];
// POJO 布尔不加 is
Boolean isDeleted;
```

---

# 二、格式

单行≤120、方法≤80 行、4 空格缩进。**左括号不换行**，**禁止省略 {}**，**逻辑块间空一行**，运算符与逗号两侧空格。

```java
// 正例：左括号不换行、禁止省略
if (flag == 0) {
    System.out.println(say);
}
for (int i = 0; i < 10; i++) {
    doSomething(i);
}
// 方法内逻辑块间空一行
public void process() {
    // 逻辑块 1：参数校验
    if (dto == null) {
        return;
    }

    // 逻辑块 2：业务处理
    User user = userMapper.getById(dto.getId());

    // 逻辑块 3：结果返回
    return buildResult(user);
}
// 逗号后空格
method(args1, args2, args3);

// 反例
// 禁止省略大括号
if (flag == 0) doSomething();
for (int i = 0; i < 10; i++) doSomething(i);
// 逻辑块间无空行、省略大括号
public void process() {
    if (dto == null) return;
    User user = userMapper.getById(dto.getId());
    return buildResult(user);
}
// 逗号后无空格
method(a,b,c);
// Tab 缩进，应用 4 空格
```

---

# 三、常量与枚举

禁止魔法值，Long 用大写 L，按功能分类，固定范围用 enum。

**【强制】** type/status 等多值字段**必须建枚举**，Entity 字段 Javadoc 引用 `{@link XxxEnum}`。

**【强制】** 业务类型、状态等多值字段的**判断必须使用枚举**，禁止直接使用 `== 1`、`== 2` 等魔法值比较。

```java
// 正例：多值字段建立枚举，Entity 字段注释引用
/** 订单状态，见 {@link OrderStatusEnum} */
private Integer status;
/** 订单类型，见 {@link OrderTypeEnum} */
private Integer type;

public enum OrderStatusEnum {
    PENDING(0, "待处理"),
    PAID(1, "已支付"),
    CANCELLED(2, "已取消");
    private final int code;
    private final String desc;
    // ...
}
// 正例：使用枚举进行判断（避免 NPE 用 Objects.equals 或枚举 is 方法）
if (Objects.equals(OrderStatusEnum.PAID.getCode(), order.getStatus())) { }
if (OrderStatusEnum.PENDING.is(order.getStatus())) { }  // 枚举提供 is(Integer code) 方法更佳

// 正例
Long a = 2L;
private static final String CACHE_KEY_PREFIX = "user:";
public enum StatusEnum { PENDING, PAID }

// 反例：多值字段无枚举、无注释
private Integer status;  // 魔法值 0/1/2 无枚举映射
// 反例：直接使用魔法值比较
if (order.getStatus() == 1) { }           // 禁止
if (order.getType() == 2) { }             // 禁止
// 魔法值
String key = "Id#taobao_" + id;
// 小写 l 易混淆
Long a = 2l;
// 大而全常量类
public class AllConsts { ... }
```

---

# 四、控制语句

**【强制】** if/for/while 禁止省略 {}，单行亦然。switch 有 default，if-else≤3 层，复杂条件赋布尔变量，避免取反。

```java
// 正例：卫语句、左括号不换行
if (man.isUgly()) {
    return;
}
if (man.isPoor()) {
    return;
}
// 正向逻辑
if (x < 628) {
    // ...
}

// 反例
// 禁止省略大括号（单行也不可）
if (cond) return;
for (int i = 0; i < 10; i++) doSomething(i);
// 取反逻辑
if (!(x >= 628)) { ... }
// 三目类型不一致可能 NPE
Integer r = flag ? a * b : c;
// 无 default
switch (x) { case 1: ... }
```

---

# 五、OOP 与封装

覆写 @Override，方法顺序公有>私有>getter/setter，getter/setter 无业务逻辑，循环拼接用 StringBuilder。

**【强制】** 重复逻辑提取方法，禁止复制粘贴。**复杂多分支/多类型采用策略模式**。

```java
// 正例：重复逻辑提取方法，使用枚举判断
private boolean isValidOrder(OrderEntity order) {
    return order != null && order.getStatus() != null
        && Objects.equals(OrderStatusEnum.PAID.getCode(), order.getStatus());
}
public void processA(OrderEntity order) {
    if (!isValidOrder(order)) {
        return;
    }
    // ...
}
public void processB(OrderEntity order) {
    if (!isValidOrder(order)) {
        return;
    }
    // ...
}

// 反例：重复代码未提取，且使用魔法值比较
public void processA(OrderEntity order) {
    if (order == null || order.getStatus() == null || order.getStatus() != 1) return;  // 禁止 == 1
    // ...
}
public void processB(OrderEntity order) {
    if (order == null || order.getStatus() == null || order.getStatus() != 1) return;  // 重复 + 魔法值
    // ...
}
```

```java
// 正例
@Override
public String toString() {
    return "User";
}
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 100; i++) {
    sb.append("x");
}

// 反例
// getter 加业务逻辑
public Integer getData() {
    return condition ? data + 100 : data - 100;
}
// 循环拼接
for (int i = 0; i < 100; i++) { str = str + "x"; }
// 构造方法写业务
public User() { initCache(); }
```

---

# 六、集合

判空 isEmpty，toArray 带参，asList 不可修改，toMap 需 mergeFunction 且 value 非 null。

```java
// 正例
if (list.isEmpty()) {
}
String[] arr = list.toArray(new String[0]);
map.entrySet().stream().collect(Collectors.toMap(k -> k, v -> v, (v1, v2) -> v2));

// 反例
// 应用 isEmpty
if (list.size() == 0) { }
// 无参，强转易 ClassCastException
list.toArray();
// UnsupportedOperationException
Arrays.asList("a", "b").add("c");
// 强转 ArrayList 异常
(ArrayList) list.subList(0,1);
```

---

# 七、日期

年份 yyyy，毫秒 currentTimeMillis，一年天数不写死 365。

```java
// 正例
new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
long ts = System.currentTimeMillis();
int days = LocalDate.now().lengthOfYear();

// 反例
// YYYY 跨年错误
new SimpleDateFormat("YYYY-MM-dd");
// 应用 currentTimeMillis
new Date().getTime();
// 禁止
java.sql.Date d;
// 写死 365，闰年错误
int[] days = new int[365];
```

---

# 八、抽象层

上层依赖下层，DAO 不打印日志，Service 记录，Web 不往上抛。入参 Entity/DTO，多参数用 DTO。

```java
// 正例：Entity/DTO 封装
// DTO 含 pageNum, pageSize, keyword
List<User> list(UserListDTO dto);

// 反例
// 多参数
List<User> list(int page, int size, String kw, Long deptId);
// Map 传参
List<User> list(Map<String, Object> params);
// Query 入参，禁止
List<User> list(UserQuery query);
// Web 层不往上抛
// throw new Exception();
// DAO 层不打印
// logger.error(...);
```

---

# 九、POJO 约束

POJO 分 Entity、DTO、VO。Boolean 不加 is，必须 toString，无默认值，构造无业务逻辑。**多值字段建枚举并引用**。入参 Entity/DTO；出参 Web 用 VO、非 Web 用 DTO（Mapper 可用 Entity）。**转换优先 MapStruct**。

```java
// 正例
public class OrderEntity {
    /** 订单状态，见 {@link OrderStatusEnum} */
    private Integer status;
    /** 订单类型，见 {@link OrderTypeEnum} */
    private Integer type;
    private Boolean deleted;
    @Override
    public String toString() {
        return ToStringBuilder.reflectionToString(this);
    }
}
// 入参 Entity
void save(UserEntity entity);
// Web 层出参 VO
UserVO getById(Long id);
// 非 Web 层出参 DTO
UserDTO getById(Long id);

// 反例
// 应用 UserEntity
public class UserDO { }
// 序列化问题
private Boolean isDeleted;
// 无 toString
// 属性默认值
private Date createTime = new Date();
// 入参出参混用
void save(UserEntity e, UserVO v);
```

---

# 十、入参出参

入参 Entity/DTO，≥3 参数用 DTO。非 Web 出参 DTO（Mapper 可用 Entity）。入参保护，返回 null 需注释，RPC 用 Result。

```java
// 正例
// Entity/DTO 封装
List<UserDTO> list(UserListDTO dto);
if (ids != null && ids.size() > 500) throw new IllegalArgumentException();
/** @return 不存在时返回 null */
UserDTO getById(Long id);

// 反例
// 多参数
void update(Long id, String name, Integer status, Date time);
// 无 size 限制，ids 可传 10000
List<User> listByIds(List<Long> ids);
```

---

# 十一、注释

类/方法/字段 Javadoc，类含 @author（Git 用户名）、@date，方法含 @param/@return/@throws。**注释在行上方，禁止行尾**。

```java
// 正例
/**
 * 订单服务
 * @author zhangsan
 * @date 2024/01/15
 */
public class OrderService {
    /** 根据ID查询，不存在返回 null */
    public Order getById(Long id) {
    }
}

// 反例
// 订单服务，应用 Javadoc
// 返回 null 未注释
public Order getById(Long id) { }
```

---

# 十二、日志规范

**【强制】** SLF4J/@Slf4j 门面，禁止 Log4j/Logback API。用 `{}` 占位符，禁止 `+` 拼接。禁止 System.out、e.printStackTrace()、JSON 打印对象。（SLF4J 已做级别判断，无需 isDebugEnabled）

| 级别 | 用途 | 生产 |
|------|------|------|
| error | 系统错误、异常 | 必须 |
| warn | 用户输入错误、可恢复异常 | 有选择 |
| info | 关键业务流程 | 有选择 |
| debug/trace | 调试 | 禁止 |

```java
// 正例
@Slf4j
public class OrderService {
    public void create(OrderDTO dto) {
        log.debug("create order, userId={}", dto.getUserId());
        // ...
        log.info("order created, orderId={}", orderId);
    }
}
// 异常 e 放最后
log.error("create order fail, params={}", params, e);

// 反例
logger.info("id:" + id);  // 字符串拼接
System.out.println("debug");  // 禁止
e.printStackTrace();  // 禁止
logger.info("order={}", JSON.toJSONString(order));  // 可能抛异常
logger.error("userId invalid");  // 用户错误用 warn
logger.debug("processing...");  // 生产禁止
```

**配置**：保留≥15 天；命名 `appName_logType_logName.log`；`additivity=false` 防重复。

---

# 十三、审查清单

全局（先查询再新增） | 命名 | 格式 | 常量/枚举 | 控制 | OOP/封装 | 集合 | 日期 | 日志 | 抽象层 | POJO | 入参出参 | 注释
