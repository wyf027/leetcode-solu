---
name: java-enum
description: >-
  规范 Java 微服务枚举与错误码的定义方式，强制实现 BaseEnum 与 ErrorCode 接口，统一错误码模块前缀与 code 范围。
  涵盖：BaseEnum 接口约定、业务枚举（状态/类型）写法、ErrorCode 模块前缀与 code 范围规划、BusinessException 抛出姿势、common-base 复用强制要求。
  适用于：新建枚举类、定义错误码、状态枚举、类型枚举、BaseEnum、ErrorCode、错误码规划、BusinessException、错误分类。
compatibility: Java 17+, Spring Boot 3+, 项目须含 common-base 模块
metadata:
  domain: java-microservice
  layer: domain
---

# 枚举与错误码规范

---

## 步骤：新建业务枚举

**适用场景**：字段有固定的多个取值（type/status/result/level）

1. 文件放 `{service}-api`（跨服务共用）或 `{service}-service`（仅内部）
2. 实现 `BaseEnum<Integer, String>`：

   ```java
   public enum JobTypeEnum implements BaseEnum<Integer, String> {
       FULL_TIME(1, "全职"),
       PART_TIME(2, "兼职");

       private final Integer code;
       private final String desc;

       JobTypeEnum(Integer code, String desc) {
           this.code = code;
           this.desc = desc;
       }

       @Override public Integer getCode() { return code; }
       @Override public String getDesc() { return desc; }
   }
   ```

3. 是否类字段（`is_deleted`/`is_correct`）→ 直接复用 `YesNo`，**禁止新建枚举**
4. **字段类型铁律**：枚举内部 `code` / `desc` 字段一律 `Integer` / `String`，构造器入参与 `getCode()` 返回值同样用 `Integer`，**禁止 `int`**（与 [`java-pojo`](../java-pojo/SKILL.md) PO-07、[`java-database`](../java-database/SKILL.md) DDL 映射表互锁；`MyBatis-Plus` 序列化、Jackson、Feign 全链路对装箱类型友好，基本类型在 NULL/未传场景会触发歧义）

---

## 步骤：新建 ErrorCode

**ErrorCode 格式**：`XXYYZZZ`（7 位）— XX=服务编码 · YY=业务模块 · ZZZ=具体错误

| 服务 | XX |
|------|----|
| system | 10 |
| platform | 20 |
| integration | 30 |
| hire | 40 |
| assess | 50 |

1. 确认服务 XX 编码（见上表）
2. 确认业务模块 YY（同一模块保持稳定，如职位配置 = `01`）
3. ZZZ 从 `001` 顺序分配（`001~099` 查询/不存在，`100~199` 写操作，`200~299` 状态流转）
4. 实现 `ErrorCode` 接口（`code` 字段必须 `Integer`，**禁止 `int`**）：

   ```java
   public enum JobConfigErrorCode implements ErrorCode {
       JOB_CONFIG_NOT_FOUND(4001001, "职位配置不存在"),
       JOB_CONFIG_NAME_DUPLICATED(4001101, "职位名称已存在");

       private final Integer code;
       private final String desc;

       JobConfigErrorCode(Integer code, String desc) {
           this.code = code; this.desc = desc;
       }

       @Override public Integer code() { return code; }
       @Override public String desc() { return desc; }
   }
   ```

5. 使用：

   ```java
   // ✅ 抛异常
   throw JobConfigErrorCode.JOB_CONFIG_NOT_FOUND.toEx();

   // ✅ 返回失败结果
   return JobConfigErrorCode.JOB_CONFIG_NOT_FOUND.toResult();

   // ❌ 禁止
   throw new RuntimeException("职位配置不存在");
   return Result.fail(500, "职位配置不存在");
   ```

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 是否类字段（is_deleted/is_correct） | 复用 `YesNo`，不新建枚举 |
| 枚举值需要前端展示中文 | `getDesc()` 已提供；VO 中额外输出 `typeDesc` 字段 |
| 历史遗留错误码格式不规范 | 新增继续走规范，存量错误码在 `900~999` 兜底，不强行迁移 |
| 多个服务公用同一个业务枚举 | 放 `commons/common-base` 或 `{service}-api`（按消费方范围决定） |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [ERROR_CODE_DESIGN](references/ERROR_CODE_DESIGN.md) | 错误码模块划分与设计详解 |
| [XxxEnum.java](references/XxxEnum.java) | 业务枚举模版 |
| [XxxErrorCode.java](references/XxxErrorCode.java) | 错误码枚举模版 |
| [README](references/README.md) | 整体说明 |

**示例**：[UserStatusEnum.java](assets/UserStatusEnum.java) · [UserErrorCode.java](assets/UserErrorCode.java)

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# 枚举 / ErrorCode 规范（BaseEnum / ErrorCode 实现 / 禁 RuntimeException）
bash ~/cursor/skills/java-enum/scripts/check-enum.sh <模块路径>

# 枚举 code 值 / 错误码范围冲突（模块内唯一性 + 跨模块不越界）
python3 ~/cursor/skills/java-enum/scripts/check-code-conflict.py <项目根路径>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
