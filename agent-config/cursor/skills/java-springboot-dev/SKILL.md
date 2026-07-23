---
name: java-springboot-dev
description: |
  Spring Boot 开发综合技能（阿里嵩山版）。整合：数据库设计、Mapper、Service、Controller、工具类、代码风格。
  适用于：Spring Boot 开发、开发设计规范。专项场景可单独使用 java-database-design、java-mapper、java-service、java-controller、java-utils、java-code-style。
---

# Spring Boot 开发技能

基于阿里巴巴 Java 开发手册（嵩山版），涵盖**数据库设计**、**Mapper 层**、**Service 层**、**Controller 层**、**工具类**与**代码风格**（含日志）。由六个独立技能组成：

- **java-database-design**：数据库专项
- **java-mapper**：Mapper 层专项（Mapper 写法、Entity 映射）
- **java-service**：Service 层专项（事务、业务编排、异常处理）
- **java-controller**：Controller 层专项（REST API、入参出参、统一 Result）
- **java-utils**：开发工具类专项（Utils/Helper 设计、常用库推荐）
- **java-code-style**：代码风格专项（命名、格式、日志、注释）

综合场景应用本技能；专项场景可单独使用对应技能。

**【全局约束】** 禁止重复造轮子。新增前先查询项目内、依赖库、JDK、Spring 等是否已有合适方法，优先复用；无可用实现时再新增开发。

---

# 一、数据库设计

详见 [java-database-design](../java-database-design/SKILL.md)

| 模块 | 要点 |
|------|------|
| 建表 | 命名小写、必备三字段、decimal、索引命名、仅主键用 bigint |
| 索引 | 唯一业务建唯一索引、varchar 指定长度、无左/全模糊 |
| SQL | count(*)、多表别名、无外键/存储过程、#{} |
| ORM | 无 select *、resultMap、type/status 建枚举并注释引用、布尔映射 |

---

# 二、Mapper 层

详见 [java-mapper](../java-mapper/SKILL.md)

| 模块 | 要点 |
|------|------|
| 接口 | XxxMapper、get/list/save 前缀、简单 SQL 可注解、入参 Entity/DTO、出参 Entity 或 DTO |
| SQL 写法 | 无 select *、#{}、count(*)、IFNULL(sum)、ISNULL、多表别名、无外键/存储过程、update_time |
| resultMap | 每表必有、Boolean 映射 is_xxx、类型匹配 |

---

# 三、Service 层

详见 [java-service](../java-service/SKILL.md)

| 模块 | 要点 |
|------|------|
| 职责 | 业务编排、参数校验、仅用本域 Mapper、跨域调其他 Service、记录日志 |
| 命名 | XxxService、@Service、入参 Entity/DTO、出参 DTO |
| 事务 | @Transactional、readOnly、rollbackFor |
| 异常 | 不吞异常、业务异常与系统异常区分 |
| 协作 | 禁止直接注入其他 Mapper、跨域调 Service、简单操作用 MyBatis-Plus Lambda、count=0 提前返回、in≤1000 |
| 复杂业务 | 采用策略模式，便于扩展维护 |

---

# 四、Controller 层

详见 [java-controller](../java-controller/SKILL.md)

| 模块 | 要点 |
|------|------|
| 职责 | 接收请求、参数校验、调用 Service、封装响应，无业务逻辑 |
| 接口设计 | 严格 RESTful：顶层路径与业务/表挂钩、资源名词复数、URL 无动词、GET/POST/PUT/PATCH/DELETE 语义 |
| 命名 | XxxController、@RestController |
| 入参 | 仅 DTO、@Valid、@RequestBody/@PathVariable/@RequestParam |
| 出参 | 仅 VO、统一 Result、DTO 转 VO、对象转换优先 MapStruct |
| 异常 | 全局 @ControllerAdvice 统一处理 |

---

# 五、开发工具类

详见 [java-utils](../java-utils/SKILL.md)

| 模块 | 要点 |
|------|------|
| 设计 | 私有构造、不可实例化、静态方法、无状态 |
| 命名 | XxxUtils/XxxHelper、按功能域划分 |
| 方法 | 入参校验、返回 null 注释、无业务逻辑 |
| 推荐 | 先查询再新增、Commons、Hutool、Guava 等成熟库 |

---

# 六、代码风格（含日志）

详见 [java-code-style](../java-code-style/SKILL.md)

| 模块 | 要点 |
|------|------|
| 命名 | 类 UpperCamelCase、方法 lowerCamelCase、常量全大写下划线 |
| 格式 | 单行≤120 字、方法≤80 行、4 空格缩进、左括号不换行、禁止省略{}、逻辑块间空行 |
| 日志 | SLF4J/@Slf4j、`{}` 占位符、异常传 e、禁止 System.out/e.printStackTrace/JSON 打印 |
| 常量/枚举/控制/OOP/集合/日期 | 魔法值、type/status 建枚举且判断用枚举、大括号、@Override、isEmpty、yyyy、封装（重复提取方法）等 |
| 抽象层 | 分层依赖、异常按层处理、入参 Entity/DTO |
| POJO | Entity/DTO/VO、Boolean 无 is、toString、入参 Entity/DTO、非 Web 层出参用 DTO（Mapper 可用 Entity） |
| 入参出参 | 入参 Entity/DTO、≥3 参数用 DTO、非 Web 层出参用 DTO（Mapper 可用 Entity）、入参保护、RPC 用 Result |
| 注释 | 类/方法/字段 Javadoc，@author 为 Git 用户名，关键节点注释 |

---

# 七、综合审查清单

**全局**：先查询再新增，禁止重复造轮子

**日志**：SLF4J/@Slf4j、占位符、异常堆栈、无禁用输出

**建表**：命名、必备三字段、索引命名、decimal、仅主键 bigint

**索引**：唯一索引、varchar 长度、无左/全模糊

**SQL**：count(*)、多表别名、无外键、#{}

**Mapper**：无 select *、resultMap、#{}、type/status 建枚举、Boolean 映射、update_time、无 HashMap

**Service**：XxxService、@Transactional、Entity/DTO、参数校验、异常不吞、关键日志、策略模式

**Controller**：RESTful、XxxController、仅调 Service、入参 DTO、出参 VO、MapStruct、@Valid、Result、全局异常

**工具类**：先查询再新增、私有构造、静态方法、无业务逻辑、XxxUtils、入参校验

**风格**：命名、格式、日志、常量、控制、OOP、封装、集合、日期、抽象层、POJO、入参出参、注释
