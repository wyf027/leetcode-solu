---
name: java-utils
description: >-
  规范 Java 微服务工具类（Utils/Helper）的设计原则，指导如何优先复用现有库、避免重复造轮子。
  涵盖：私有构造、final 类、静态方法无状态、入参 null 校验、命名约定（XxxUtils/XxxHelper）、推荐库优先级（JDK → common-base → Commons/Hutool/Guava）、禁止业务逻辑与 Spring 依赖。
  适用于：编写工具类、Utils、Helper、StringUtils、DateUtils、工具方法设计、复用现有工具库、避免重复封装。
compatibility: Java 17+, Spring Boot 3+
metadata:
  domain: java-microservice
  layer: utils
---

# 工具类规范（Utils / Helper）

---

## 步骤：新建工具类

**第一步：先查已有实现**（禁止重复造轮子）

按优先级查找：`JDK → common-base → 项目 Utils → Apache Commons Lang3 / Hutool / Guava`

| 场景 | 先查 |
|------|------|
| 字符串处理 | `org.apache.commons.lang3.StringUtils`、`org.springframework.util.StringUtils` |
| 集合操作 | JDK `Stream`、`org.springframework.util.CollectionUtils` |
| 日期格式化 | `java.time.format.DateTimeFormatter`（禁用 `SimpleDateFormat`，非线程安全） |
| JSON 序列化 | 项目统一的 Jackson `ObjectMapper`（禁止混用 FastJSON/Gson） |

**第二步：确认需要新建**，按模版创建：

```java
public final class JobCodeUtils {          // final 类，禁止继承

    private JobCodeUtils() {
        throw new UnsupportedOperationException("utility class");  // 私有构造
    }

    /**
     * 生成职位编号，格式：JOB-{年月日}-{序号}
     *
     * @param seq 序号，null 或 <=0 时使用默认值 1
     * @return 职位编号，永不为 null
     */
    public static String generateCode(Integer seq) {
        int safeSeq = (seq != null && seq > 0) ? seq : 1;
        return "JOB-" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
                + "-" + String.format("%04d", safeSeq);
    }
}
```

**第三步：强制检查清单**：
- [ ] `final` 类 + `private` 构造
- [ ] 全部静态方法，无实例字段
- [ ] 入参 null/边界值校验
- [ ] 返回值为 null 时 Javadoc 明确说明
- [ ] 无业务逻辑（状态流转/数据库操作/MQ 发送）
- [ ] 无 Spring 依赖（无 `@Resource`/`@Autowired`/`@Value`）

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 工具方法需要调用 Spring Bean（如 Redis） | 说明该方法不是纯工具；提升为 Spring `@Service` 或 `@Component` |
| 工具类需要配置参数（如密钥、前缀） | 不用 `static` 变量硬编码；改为 `@Component` + `@Value` 注入 |
| 多个工具类功能重叠 | 合并到同一个按功能域命名的 Utils；禁止 `CommonUtils` 大杂烩 |
| 日期处理出现线程安全问题 | 禁用 `SimpleDateFormat`；改用 `DateTimeFormatter`（线程安全） |
| 工具方法抛出受检异常 | 捕获后包装为 `RuntimeException` 或业务 `BusinessException`，禁止向上传播 `IOException` 等 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [README](references/README.md) | 工具类约定与推荐库优先级 |
| [XxxUtils.java](references/XxxUtils.java) | 工具类模版 |

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# 工具类规范（禁注入 Spring Bean / final 类 / 全 static 方法 / 禁业务逻辑）
bash ~/cursor/skills/java-utils/scripts/check-utils.sh <模块路径>
# 示例
bash ~/cursor/skills/java-utils/scripts/check-utils.sh ./assess-service/src

# 工具类构造方法检查（UT-03：禁 public/protected 构造，必须显式声明 private 构造）
python3 ~/cursor/skills/java-utils/scripts/check-utils-advanced.py <模块路径>
# 示例
python3 ~/cursor/skills/java-utils/scripts/check-utils-advanced.py ./assess-service/src
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
