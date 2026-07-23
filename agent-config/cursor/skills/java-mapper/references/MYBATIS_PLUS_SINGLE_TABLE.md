# MyBatis-Plus 单表写法规范

**何时使用**：编写单表 CRUD 时，优先查阅本文档选取正确的 API 和写法。

## 选型原则

| 场景 | 推荐写法 |
|------|----------|
| 简单条件查询 / 更新 | `lambdaQuery()` / `lambdaUpdate()` |
| 复杂条件，需复用 | `LambdaQueryWrapper` / `LambdaUpdateWrapper` 提取为私有方法 |
| 多表 JOIN / 子查询 | 自定义 Mapper 方法 + XML |
| count=0 短路分页 | `count(wrapper)` 先 count，再分页 |

---

## 查询

### 按主键查单条

```java
// 推荐：IService 已提供 getById，ServiceImpl 内直接调用 getById
XxxEntity entity = getById(id);
if (entity == null) {
    throw XxxErrorCode.XXX_NOT_FOUND.toEx();
}

// 业务语义封装为私有方法（避免重复判空）
private XxxEntity findByIdOrThrow(Long id) {
    XxxEntity entity = getById(id);
    if (entity == null) {
        throw XxxErrorCode.XXX_NOT_FOUND.toEx();
    }
    return entity;
}
```

### 按条件查单条

```java
// lambdaQuery()：链式，适合简短条件
XxxEntity entity = lambdaQuery()
        .eq(XxxEntity::getCode, code)
        .eq(XxxEntity::getDeleted, 0)
        .one();                           // 结果 >1 抛异常；不存在返回 null

// ❌ 严禁：裸传 LambdaQueryWrapper，改用 lambdaQuery() 链式写法
// XxxEntity entity = getOne(new LambdaQueryWrapper<XxxEntity>().eq(XxxEntity::getCode, code), false);
```

### 列表查询（不分页）

```java
// 简单条件：lambdaQuery()
List<XxxEntity> list = lambdaQuery()
        .eq(XxxEntity::getStatus, status)
        .orderByDesc(XxxEntity::getCreateTime)
        .list();

// 动态条件：提取 buildListWrapper 私有方法，避免 list() 方法臃肿
private LambdaQueryWrapper<XxxEntity> buildListWrapper(String name, Integer status) {
    return new LambdaQueryWrapper<XxxEntity>()
            .like(StringUtils.isNotBlank(name), XxxEntity::getName, name)
            .eq(status != null, XxxEntity::getStatus, status)
            .orderByDesc(XxxEntity::getCreateTime);
}
```

### 分页查询（标准三段式）

```java
// 1. 入参保护
pageSize = Math.min(pageSize, 100);

LambdaQueryWrapper<XxxEntity> wrapper = buildListWrapper(name, status);

// 2. count 短路：total=0 直接返回，避免无效 LIMIT 查询
long total = count(wrapper);
if (total == 0) {
    return PageResult.empty();
}

// 3. 分页查询
Page<XxxEntity> page = page(new Page<>(pageNum, pageSize), wrapper);
return PageResult.of(xxxConvert.toDTOList(page.getRecords()), total);
```

### 数量查询

```java
// 总数
long total = lambdaQuery()
        .eq(XxxEntity::getStatus, 1)
        .count();
```

### 禁止：用 COUNT 做存在性判断

存在性判断必须走 `LIMIT 1`，禁止走任何 `COUNT(*)` 查询（全表扫描，无法利用索引短路）。

```java
// ❌ 禁止：.exists() 底层执行 SELECT COUNT(*)，全表统计，性能差
boolean exists = lambdaQuery()
        .eq(XxxEntity::getCode, code)
        .exists();

// ❌ 禁止：count() > 0 同样执行 SELECT COUNT(*)，存在性判断不应使用
boolean exists = lambdaQuery()
        .eq(XxxEntity::getCode, code)
        .count() > 0;

// ✅ 正确：.one() 底层走 SELECT ... LIMIT 1，命中即返回，不扫全表
XxxEntity entity = lambdaQuery()
        .select(XxxEntity::getId)   // 只取主键，减少回表
        .eq(XxxEntity::getCode, code)
        .one();
if (entity != null) { ... }

// ✅ 仅需布尔值时，封装为私有方法
private boolean existsByCode(String code) {
    return lambdaQuery()
            .select(XxxEntity::getId)
            .eq(XxxEntity::getCode, code)
            .one() != null;
}
```

### 仅查指定列

```java
// select() 指定列，避免加载无用大字段
List<XxxEntity> list = lambdaQuery()
        .select(XxxEntity::getId, XxxEntity::getName, XxxEntity::getStatus)
        .eq(XxxEntity::getStatus, 1)
        .list();
```

---

## 新增

```java
// 单条插入：save 后 entity.getId() 已回填
XxxEntity entity = xxxConvert.toEntity(dto);
save(entity);
log.info("xxx - 创建 - 成功: id = {}", entity.getId());

// 批量插入（默认每批 1000，内部分批提交）
List<XxxEntity> entities = xxxConvert.toEntityList(dtoList);
saveBatch(entities);

// 自定义批次大小
saveBatch(entities, 500);

// 存在则更新，不存在则插入（按主键判断）
saveOrUpdate(entity);
```

---

## 更新

### 按主键更新（变动字段）

```java
// copyToEntity 只修改业务字段，保留 id / createTime 审计字段
xxxConvert.copyToEntity(dto, entity);
updateById(entity);                  // 仅更新非 null 字段（@TableField 默认策略）
```

### 按条件更新指定字段（lambdaUpdate）

```java
// 适合只改 1-3 个字段，不需要先查再改
boolean updated = lambdaUpdate()
        .eq(XxxEntity::getId, id)
        .set(XxxEntity::getStatus, newStatus)
        .set(XxxEntity::getUpdateTime, LocalDateTime.now())
        .update();

if (!updated) {
    throw XxxErrorCode.XXX_NOT_FOUND.toEx();
}
```

```java
// 批量按条件更新
lambdaUpdate()
        .in(XxxEntity::getId, ids)
        .set(XxxEntity::getStatus, 0)
        .update();
```

### 禁止写法

```java
// ❌ 直接 new Entity 更新，会清空所有未赋值字段（若策略为 NOT_NULL 则只更新非 null）
XxxEntity entity = new XxxEntity();
entity.setId(id);
entity.setName(dto.getName());
updateById(entity);
// ✅ 改为先 findByIdOrThrow，再 copyToEntity，再 updateById
```

---

## 删除

```java
// 逻辑删除（字段标注 @TableLogic，MP 自动处理）
removeById(id);

// 按条件删除：统一用 lambdaUpdate() 链式写法
lambdaUpdate()
        .eq(XxxEntity::getBizId, bizId)
        .remove();
// ❌ 严禁：remove(new LambdaQueryWrapper<>...)，改用上方链式写法

// 批量按主键删除
removeByIds(ids);
```

> **注意**：Entity 字段 `deleted` 必须标注 `@TableLogic`，否则 `removeById` 执行物理删除。

---

## 条件构造器速查

> 所有值比较方法均有 `(condition, col, val)` 三参重载，**第一个参数为 `false` 时该条件不拼入 SQL**，动态条件统一使用此形式，禁止在外层用 `if` 拼条件。

| 方法 | SQL 等价 | 固定条件写法 | 动态条件写法（推荐） |
|------|----------|-------------|---------------------|
| `eq` | `col = val` | `.eq(XxxEntity::getStatus, 1)` | `.eq(status != null, XxxEntity::getStatus, status)` |
| `ne` | `col != val` | `.ne(XxxEntity::getStatus, 0)` | `.ne(status != null, XxxEntity::getStatus, status)` |
| `gt / ge` | `> / >=` | `.gt(XxxEntity::getAge, 18)` | `.gt(minAge != null, XxxEntity::getAge, minAge)` |
| `lt / le` | `< / <=` | `.lt(XxxEntity::getAge, 60)` | `.lt(maxAge != null, XxxEntity::getAge, maxAge)` |
| `like` | `LIKE %val%` | `.like(XxxEntity::getName, kw)` | `.like(StringUtils.isNotBlank(kw), XxxEntity::getName, kw)` |
| `likeRight` | `LIKE val%` | `.likeRight(XxxEntity::getCode, prefix)` | `.likeRight(StringUtils.isNotBlank(prefix), XxxEntity::getCode, prefix)` |
| `in` | `IN (...)` | `.in(XxxEntity::getId, ids)` | `.in(!CollectionUtils.isEmpty(ids), XxxEntity::getId, ids)` |
| `notIn` | `NOT IN (...)` | `.notIn(XxxEntity::getId, excludeIds)` | `.notIn(!CollectionUtils.isEmpty(excludeIds), XxxEntity::getId, excludeIds)` |
| `between` | `BETWEEN v1 AND v2` | `.between(XxxEntity::getScore, 60, 100)` | `.between(min != null && max != null, XxxEntity::getScore, min, max)` |
| `isNull` | `IS NULL` | `.isNull(XxxEntity::getDeletedAt)` | — |
| `isNotNull` | `IS NOT NULL` | `.isNotNull(XxxEntity::getApprovedAt)` | — |
| `orderByDesc` | `ORDER BY col DESC` | `.orderByDesc(XxxEntity::getCreateTime)` | `.orderByDesc(desc, XxxEntity::getCreateTime)` |
| `orderByAsc` | `ORDER BY col ASC` | `.orderByAsc(XxxEntity::getSort)` | — |
| `last` | 拼接末尾（慎用） | `.last("LIMIT 1")` | — |

### 动态条件综合示例

```java
// ✅ 正确：所有动态条件统一用三参重载，不用外层 if
private LambdaQueryWrapper<XxxEntity> buildListWrapper(String name, Integer status,
                                                        LocalDate startDate, LocalDate endDate,
                                                        List<Long> bizIds) {
    return new LambdaQueryWrapper<XxxEntity>()
            .like(StringUtils.isNotBlank(name), XxxEntity::getName, name)
            .eq(status != null, XxxEntity::getStatus, status)
            .ge(startDate != null, XxxEntity::getCreateDate, startDate)
            .le(endDate != null, XxxEntity::getCreateDate, endDate)
            .in(!CollectionUtils.isEmpty(bizIds), XxxEntity::getBizId, bizIds)
            .orderByDesc(XxxEntity::getCreateTime);
}

// ❌ 错误：外层 if 拼条件，臃肿且难读
LambdaQueryWrapper<XxxEntity> wrapper = new LambdaQueryWrapper<>();
if (StringUtils.isNotBlank(name)) {
    wrapper.like(XxxEntity::getName, name);
}
if (status != null) {
    wrapper.eq(XxxEntity::getStatus, status);
}
```

### in 条件超 1000 分批

```java
// in 参数不超过 1000，超出时分批查询合并结果
List<XxxEntity> result = new ArrayList<>();
List<List<Long>> partitions = Lists.partition(ids, 1000);
for (List<Long> part : partitions) {
    result.addAll(lambdaQuery().in(XxxEntity::getId, part).list());
}
```

---

## IService 内置方法速查

`ServiceImpl` 继承自 `IService`，以下方法无需自定义 Mapper，**直接在 ServiceImpl 内调用 `xxx()`**；只有父类没有封装的方法才降级使用 `baseMapper.xxx()`。

### 查询类

```java
// 按主键查，不存在返回 null
XxxEntity entity = getById(id);

// 按主键批量查（内部走 IN 查询）
List<XxxEntity> list = listByIds(ids);

// 按 Map 条件查列表（key=列名字符串，适合简单等值，不推荐用于复杂条件）
List<XxxEntity> list = listByMap(Map.of("status", 1, "deleted", 0));

// 按条件查单条：优先用 lambdaQuery() 链式；wrapper 已提前构建时才用此形式
// ❌ 严禁内联：getOne(new LambdaQueryWrapper<>()..., false)，应提取为私有方法或改用链式
XxxEntity entity = getOne(wrapper, false);

// 按条件查列表
List<XxxEntity> list = list(wrapper);

// 查全表（无条件，谨慎使用）
List<XxxEntity> all = list();

// 按条件统计数量
long count = count(wrapper);

// 分页查询（配合 MybatisPlusInterceptor 分页插件）
Page<XxxEntity> page = page(new Page<>(pageNum, pageSize), wrapper);
List<XxxEntity> records = page.getRecords();
long total = page.getTotal();
```

### 新增类

```java
// 单条插入，成功后 entity.getId() 已回填雪花 ID
boolean ok = save(entity);

// 按主键判断：存在则 UPDATE，不存在则 INSERT
boolean ok = saveOrUpdate(entity);

// 按条件判断是否存在：存在则 UPDATE，不存在则 INSERT（依赖 UniqueKey 判断）
boolean ok = saveOrUpdate(entity, wrapper);

// 批量插入，默认每批 1000 条（底层分批 INSERT，非一条 SQL）
boolean ok = saveBatch(entities);

// 批量插入，自定义批次大小
boolean ok = saveBatch(entities, 500);

// 批量 saveOrUpdate，按主键判断
boolean ok = saveOrUpdateBatch(entities);
```

### 更新类

```java
// 按主键更新（只更新非 null 字段，取决于全局 @TableField 策略）
boolean ok = updateById(entity);

// 按条件更新（entity 为值，wrapper 为条件）
boolean ok = update(entity, wrapper);

// 纯 lambdaUpdate 链式（最常用，无需 entity）
boolean ok = lambdaUpdate()
        .eq(XxxEntity::getId, id)
        .set(XxxEntity::getStatus, newStatus)
        .update();

// 批量按主键更新
boolean ok = updateBatchById(entities);

// 批量按主键更新，自定义批次大小
boolean ok = updateBatchById(entities, 500);
```

### 删除类

```java
// 按主键删除（有 @TableLogic 则逻辑删，否则物理删）
boolean ok = removeById(id);

// 按主键批量删除
boolean ok = removeByIds(ids);

// 按条件删除
boolean ok = remove(wrapper);

// 按 Map 条件删除（key=列名字符串）
boolean ok = removeByMap(Map.of("biz_id", bizId));
```

### 方法选型建议

| 场景 | 推荐方法 |
|------|----------|
| 按 ID 取单条 + 校验存在 | `getById(id)` + 判空抛异常 |
| 按条件取单条 | `lambdaQuery().eq(...).one()` |
| 批量按 ID 查 | `listByIds(ids)` |
| 简单列表（无分页） | `lambdaQuery().eq(...).list()` |
| 分页列表 | 三段式：`selectCount` 短路 → `selectPage` |
| 插入单条 | `save(entity)` |
| 批量插入 | `saveBatch(entities, 500)` |
| 更新 1-3 个字段 | `lambdaUpdate().eq(...).set(...).update()` |
| 更新多字段 | `findByIdOrThrow` → `copyToEntity` → `updateById` |
| 按 ID 删除 | `removeById(id)` |

---

## 常见反模式

| 反模式 | 危害 | 正确做法 |
|--------|------|----------|
| `select *` 全字段查 | 加载大字段浪费 IO | `select()` 指定所需列 |
| 裸传 `getOne(new LambdaQueryWrapper<>...)` | 冗长且类型不安全 | 改用 `lambdaQuery().eq(...).one()` 链式写法 |
| 每次查询后未校验 null | NPE 或静默数据错误 | 封装 `findByIdOrThrow` 统一处理 |
| in 条件传空集合 | SQL 语法错误或全表扫描 | 提前判空返回空列表 |
| count=0 后仍执行分页 | 无效的 LIMIT 查询 | 标准三段式：count 短路 |
| 更新用 `new Entity()` 直接 set | 可能意外置空其他字段 | 先查实体，再 `copyToEntity`，再 `updateById` |
| 动态条件用外层 `if` 拼 wrapper | 代码臃肿，条件遗漏风险 | 统一用三参重载 `(condition, col, val)` |
| `.exists()` / `count() > 0` 存在性判断 | 底层走 `SELECT COUNT(*)`，全表统计，无法短路 | `.select(id).one() != null`，走 `LIMIT 1` 命中即返回 |
