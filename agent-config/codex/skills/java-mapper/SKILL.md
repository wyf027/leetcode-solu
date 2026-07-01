---
name: java-mapper
description: >-
  规范 Java 微服务 Mapper 层的数据库操作写法，基于 MyBatis-Plus 提供 API 选型决策树与禁用项约束。
  涵盖：Mapper 接口继承 BaseMapper、单表 CRUD API 选型（lambdaQuery/lambdaUpdate）、禁止 COUNT 存在性判断、XML 编写约束、分页查询、批量操作。
  适用于：编写 Mapper、MyBatis-Plus 查询、lambdaQuery、lambdaUpdate、单表 CRUD、分页 Page、批量 saveBatch、XML SQL、存在性判断。
compatibility: Java 17+, Spring Boot 3+, MyBatis-Plus 3+
metadata:
  domain: java-microservice
  layer: mapper
---

# Mapper 规范（MyBatis-Plus）

---

## API 选型决策树

```
需要操作数据库？
├── 单表操作 → 优先用 IService 内置方法 / lambdaQuery / lambdaUpdate
│   ├── 简单条件 → lambdaQuery().eq(...).one() / .list()
│   ├── 只改 1-3 个字段 → lambdaUpdate().eq(...).set(...).update()
│   ├── 多字段更新 → findByIdOrThrow → copyToEntity → updateById
│   └── 分页 → 标准三段式（见下）
└── 多表 JOIN / 子查询 → 自定义 Mapper 方法 + XML
```

---

## 常用写法速查

**返回类型铁律**：自定义 Mapper 方法（XML / `@Select` / 聚合查询）的返回值与方法参数一律用包装类型 `Long` / `Integer` / `Boolean`（金额 `BigDecimal`），**禁止 `long` / `int`**。聚合 `COUNT/SUM/MAX` 在空表时返回 NULL，基本类型直接 NPE；`EXISTS` 等查询返回 0 行用 `null` 比 `false` 语义更清晰。与 [`java-pojo`](../java-pojo/SKILL.md) PO-07 / [`java-database`](../java-database/SKILL.md) DDL 映射表互锁。

**存在性判断（重点）**：

```java
// ✅ 正确：走 LIMIT 1，命中即返回
private boolean existsByCode(String code) {
    return lambdaQuery()
            .select(XxxEntity::getId)
            .eq(XxxEntity::getCode, code)
            .one() != null;
}

// ❌ 禁止：走 COUNT(*)，全表扫描
boolean exists = lambdaQuery().eq(XxxEntity::getCode, code).exists();
boolean exists = lambdaQuery().eq(XxxEntity::getCode, code).count() > 0;
```

**单条查询（重点）**：

```java
// ✅ 正确：lambdaQuery() 链式写法，类型安全，意图清晰
XxxEntity entity = lambdaQuery()
        .eq(XxxEntity::getCode, code)
        .one();

// ❌ 严禁：手动 new LambdaQueryWrapper / QueryWrapper 传入 getOne / list 等方法
XxxEntity entity = getOne(new LambdaQueryWrapper<XxxEntity>().eq(XxxEntity::getCode, code));
List<XxxEntity> list = list(new LambdaQueryWrapper<XxxEntity>().eq(XxxEntity::getStatus, status));
```

> 理由：`getOne(new LambdaQueryWrapper<...>)` 等裸 Wrapper 传参写法冗长且类型不安全，统一改用 `lambdaQuery()` / `lambdaUpdate()` 链式 API，保持全局风格一致。

**分页（标准三段式）**：

```java
pageSize = Math.min(pageSize, 100);                          // 1. 入参保护
LambdaQueryWrapper<XxxEntity> wrapper = buildListWrapper(name, status);
long total = count(wrapper);
if (total == 0) { return PageResult.empty(); }               // 2. count 短路
Page<XxxEntity> page = page(new Page<>(pageNum, pageSize), wrapper);  // 3. 分页查询
return PageResult.of(xxxConvert.toDTOList(page.getRecords()), total);
```

**动态条件（统一三参重载，禁止外层 if）**：

```java
// ✅ 正确
private LambdaQueryWrapper<XxxEntity> buildListWrapper(String name, Integer status) {
    return new LambdaQueryWrapper<XxxEntity>()
            .like(StringUtils.isNotBlank(name), XxxEntity::getName, name)
            .eq(status != null, XxxEntity::getStatus, status)
            .orderByDesc(XxxEntity::getCreateTime);
}

// ❌ 禁止：外层 if 拼条件
LambdaQueryWrapper<XxxEntity> wrapper = new LambdaQueryWrapper<>();
if (StringUtils.isNotBlank(name)) { wrapper.like(XxxEntity::getName, name); }
```

**批量操作**：

```java
saveBatch(entities, 500);       // 批量插入，自定义批次
removeByIds(ids);               // 批量按主键删除
updateBatchById(entities, 500); // 批量按主键更新
```

---

## XML 编写约束

- resultMap 必须包含**所有字段**（含 BaseEntity 公共字段）
- 禁止 `SELECT *`，必须显式列出字段
- 参数用 `#{}`，禁止 `${}` 防 SQL 注入
- `in` 条件参数不超过 1000，超出时业务层分批调用

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| `in` 传入空集合 | 提前判空，返回空列表；空集合传入 `in()` 会导致 SQL 语法错误 |
| `getOne()` 查到多条 | 统一用 `lambdaQuery()....one()`；严禁裸传 `getOne(new LambdaQueryWrapper<>...)` |
| 更新时用 `new Entity()` 直接 set | 会意外置空其他字段；改为先查再 `copyToEntity` 再 `updateById` |
| 需要只查部分字段 | `lambdaQuery().select(XxxEntity::getId, XxxEntity::getName)...` |
| count=0 仍做分页查询 | 三段式标准：count 短路，total=0 直接返回空 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [MYBATIS_PLUS_SINGLE_TABLE](references/MYBATIS_PLUS_SINGLE_TABLE.md) | 单表 CRUD API 选型与完整代码片段 |
| [XxxMapper.java](references/XxxMapper.java) | Mapper 接口模版 |
| [XxxMapper.xml](references/XxxMapper.xml) | Mapper XML 模版 |
| [README](references/README.md) | 整体说明 |

**示例**：[UserMapper.java](assets/UserMapper.java) · [UserMapper.xml](assets/UserMapper.xml)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# Mapper 层规范（IN 空集合保护 / saveBatch 分批 / 禁打日志 / BaseMapper 继承）
bash ~/cursor/skills/java-mapper/scripts/check-mapper.sh <模块路径>

# N+1 查询检测（循环内调 Mapper / Service）
python3 ~/cursor/skills/java-mapper/scripts/check-n-plus-one.py <模块路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
