# Mapper 层

**何时使用**：编写/优化 Mapper、XML 映射、MyBatis 时。

> **MyBatis-Plus 单表详细用法（含代码片段）**：见 [MYBATIS_PLUS_SINGLE_TABLE](MYBATIS_PLUS_SINGLE_TABLE.md)

## 强制约束

- 方法命名：get/list/count/save/remove/update 前缀
- 简单 SQL 可用注解（@Select/@Insert/@Update/@Delete），复杂 SQL 用 XML
- 禁止 select *；参数 #{}，禁止 ${}
- 每表必须有 resultMap；禁止 HashMap/Hashtable 接收结果
- Entity 多值字段引用 {@link XxxEnum}
- Boolean 不加 is，resultMap 映射 is_xxx
- 更新仅改变动字段（动态 SQL），必带 update_time
- 多表加别名 t1/t2/t3；in≤1000；count=0 不执行分页
