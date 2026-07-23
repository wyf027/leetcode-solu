---
name: java-database-design
description: |
  MySQL 数据库设计规范（阿里嵩山版）。涵盖：建表、索引、SQL、ORM 映射。
  适用于：设计表结构、创建索引、编写 SQL、ORM 映射、MySQL 表设计相关场景。
---

# Java 数据库设计规范

基于阿里巴巴 Java 开发手册（嵩山版），指导 MySQL 建表、索引、SQL 与 ORM 映射。

## 1. 建表规约

| 规约 | 说明 |
|------|------|
| 布尔字段 | `is_xxx`，tinyint unsigned（1/0） |
| 命名 | 表名、字段名小写+下划线，禁止数字开头、`__数字__` |
| 表名 | 不用复数；命名：`业务名_表作用`，如 alipay_task |
| 小数 | 用 decimal，禁止 float/double |
| 字符串 | 定长用 char；varchar≤5000，超长用 text 独立表 |
| 必备字段 | id (bigint unsigned 自增)、create_time、update_time (datetime) |
| bigint 约束 | **仅主键使用 bigint**；外键引用主键时类型一致；其他字段按范围选 int/tinyint/smallint，禁止滥用 |
| 索引命名 | 主键 pk_字段名；唯一 uk_字段名；普通 idx_字段名 |
| 分库分表 | 单表>500万行或>2GB 才考虑 |

**冗余**：适度允许，需非频繁修改、非唯一索引、非超长。

```sql
-- 正例
CREATE TABLE order_task (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  is_deleted TINYINT UNSIGNED DEFAULT 0,
  create_time DATETIME,
  update_time DATETIME,
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_status (status)
);

-- 反例
-- 表名大写
CREATE TABLE OrderTask (
  id BIGINT,
  -- 非主键滥用 bigint
  quantity BIGINT,
  -- 应为 is_deleted
  deleted TINYINT,
  -- 应为 decimal
  amount FLOAT
);
```

## 2. 索引规约

| 规约 | 说明 |
|------|------|
| 唯一业务字段 | 必须建唯一索引 |
| 多表 join | 禁止超过 3 表；关联字段类型一致、需有索引 |
| varchar 索引 | 指定长度，按区分度决定（一般 20 长度区分度>90%） |
| 模糊查询 | 禁止左模糊、全模糊，需走搜索引擎 |
| order by | 利用索引有序性，order by 字段放组合索引最后 |
| 组合索引 | 等号条件列前置；区分度高的放左边 |
| 隐式转换 | 防止字段类型不同导致索引失效 |

**分页**：大 offset 用延迟关联。**explain**：至少 range，推荐 ref，最佳 consts。

```sql
-- 正例：唯一索引、varchar 指定长度、组合索引 a_b_c
CREATE UNIQUE KEY uk_user_phone ON user(phone);
CREATE KEY idx_name ON user(name(20));
-- where a=? and b=? order by c 时建 idx_a_b_c

-- 反例
-- 左模糊，索引失效
SELECT * FROM user WHERE name LIKE '%张';
-- 全模糊
SELECT * FROM user WHERE name LIKE '%张%';
-- 超 3 表
SELECT * FROM t1 JOIN t2 JOIN t3 JOIN t4;
```

## 3. SQL 规约

| 规约 | 说明 |
|------|------|
| count | 用 count(*)，不用 count(列名)/count(常量) |
| sum | 注意 NPE：`SELECT IFNULL(SUM(col), 0)` |
| NULL 判断 | 用 ISNULL(column) |
| 分页 | count=0 直接返回，不执行分页 SQL |
| 外键 | 禁止使用，应用层解决 |
| 存储过程 | 禁止使用 |
| 数据订正 | 先 select 确认，再 update/delete |
| 多表 | 列名前加表别名限定，如 t1.name |
| 别名 | 用 as，按 t1、t2、t3 顺序 |
| in | 元素数控制在 1000 内 |
| 字符集 | utf8；存表情用 utf8mb4 |

```sql
-- 正例
SELECT COUNT(*) FROM user;
SELECT IFNULL(SUM(amount), 0) FROM order;
-- 或 ISNULL(name)=0
SELECT * FROM user WHERE name IS NOT NULL;
SELECT t1.id, t1.name FROM user t1 JOIN order t2 ON t1.id = t2.user_id;
-- 元素≤1000
SELECT * FROM user WHERE id IN (1, 2, 3);

-- 反例
-- 应用 count(*)
SELECT COUNT(id) FROM user;
-- 未防 NPE
SELECT SUM(amount) FROM order;
-- 应用 ISNULL
SELECT * FROM user WHERE name = NULL;
-- 无表别名
SELECT id FROM user, order WHERE user.id = order.user_id;
```

## 4. ORM 映射

| 规约 | 说明 |
|------|------|
| 查询字段 | 禁止 select *，明确列出字段 |
| 多值字段 | type、status 等需建立枚举映射，Entity 字段注释引用 `{@link XxxEnum}` |
| 布尔映射 | Entity/DTO/VO 不加 is 前缀，DB 用 is_xxx，resultMap 做映射 |
| resultMap | 必须定义，不用 resultClass |
| 参数 | 用 #{}，禁止 ${}（防 SQL 注入） |
| 结果集 | 禁止 HashMap/Hashtable 接收 |
| 更新 | 必须更新 update_time |

```xml
<!-- 正例：无 select *、resultMap、#{}、update_time -->
<select id="getById" resultMap="BaseResultMap">
  SELECT id, name, is_deleted, create_time FROM user WHERE id = #{id}
</select>
<update id="update">
  UPDATE user SET name = #{name}, update_time = NOW() WHERE id = #{id}
</update>

<!-- 反例 -->
<!-- 禁止 HashMap -->
<select id="getById" resultType="HashMap">
  SELECT * FROM user WHERE id = ${id}
</select>
<!-- 禁止 ${}，防注入；缺少 update_time -->
<update id="update">
  UPDATE user SET name=#{name} WHERE id=#{id}
</update>
```

## 5. 审查清单

- [ ] 命名规范，必备三字段，索引命名，小数用 decimal，仅主键用 bigint
- [ ] 唯一业务建唯一索引，varchar 指定长度，无左/全模糊
- [ ] count(*)，多表加别名，无外键/存储过程，参数用 #{}
- [ ] 无 select *，有 resultMap，布尔字段映射正确
