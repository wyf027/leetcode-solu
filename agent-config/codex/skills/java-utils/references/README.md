# 工具类

**何时使用**：编写/优化 Utils、Helper 时。

## 强制约束

- 私有构造、final 类、不可实例化
- 静态方法、无状态、无副作用
- 入参 null/边界校验；返回 null 需 Javadoc 说明
- 命名 XxxUtils/XxxHelper，按功能域划分
- 禁止业务逻辑；不依赖 Spring/Mapper/Service
- 先查询已有实现再新增；禁止重复封装 Result/ErrorCode

## 推荐库优先级

JDK → common-base（项目基础模块）→ 项目 Utils → Commons/Hutool/Guava

| 场景 | 推荐 |
|------|------|
| 字符串 | Apache Commons Lang3、Spring StringUtils |
| 集合 | Apache Commons Collections、Guava、Spring CollectionUtils |
| 日期 | java.time（Java 8+）、Hutool DateUtil |
| JSON | Jackson、Fastjson2 |
| 对象转换 | MapStruct（优先）、Spring BeanUtils |
| 加密 | Hutool SecureUtil、BouncyCastle |
