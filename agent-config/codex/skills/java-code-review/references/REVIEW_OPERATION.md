# 代码审查操作附录

## 高频问题速查（输入示例 → 正确修复）

**问题**：`@ConfigurationProperties` 字段缺少 Javadoc，基础设施语义靠猜

```java
// ❌ 字段名无法表达 Redis 数据结构用途，阅读者需翻 GatewayImpl 才能理解
@ConfigurationProperties(prefix = "ai-microservice")
public class AiMicroserviceProperties {
    private Integer taskTtlHours = 4;
    private String pendingZsetKey = "ai-microservice:pending";
    private String taskHashPrefix = "ai-microservice:task:";
    private String businessKeyPrefix = "ai-microservice:biz:";
}

// ✅ 对"名字无法自解释"的字段补 Javadoc，说明数据结构类型、用途、影响范围
@ConfigurationProperties(prefix = "ai-microservice")
public class AiMicroserviceProperties {

    /**
     * AI 任务在 Redis 中的缓存时长（小时）。
     * <p>影响范围：任务状态 key（{@code ai:task:{taskId}}）和结果 key（{@code ai:result:{taskId}}）的 TTL。
     */
    private Integer taskTtlHours = 4;

    /**
     * 待重试任务的 ZSet key（Redis Sorted Set）。
     * <p>score = 下次重试的 Unix 时间戳（秒），member = taskId。
     */
    private String pendingZsetKey = "ai-microservice:pending";

    /**
     * 任务元数据 Hash 的 key 前缀，完整 key = {@code prefix + taskId}。
     * <p>Hash 字段存储：businessId、taskType、重试次数、最后请求时间等。
     */
    private String taskHashPrefix = "ai-microservice:task:";

    /**
     * 业务幂等 key 前缀，完整 key = {@code prefix + businessKey}，value = taskId。
     * <p>防止同一业务请求重复创建 AI 任务。
     */
    private String businessKeyPrefix = "ai-microservice:biz:";
}
```

> **强制要求**：**所有字段必须有注释**，无论名称是否自解释。`baseUrl`、`readTimeoutMs` 这类"看起来清楚"的字段同样须标注单位、影响范围或关联配置项；Redis key pattern / 数据结构类型 / 业务取值约束尤其不得省略。

---

**问题**：注释与代码语义脱节

```java
// ❌ 代码改了，注释还在描述旧逻辑
/** 根据用户 ID 查询用户信息 */
public JobConfigDTO getByCode(String code) { ... }  // 实际按 code 查，注释说按 ID

// ✅ 修复：注释同步更新
/** 根据职位编号查询职位配置，不存在时返回 null */
public JobConfigDTO getByCode(String code) { ... }
```

**问题**：日志打印敏感字段或整包序列化

```java
// ❌ 泄露敏感字段 / 大字段打爆日志
log.info("用户 - 创建 - 开始: dto = {}", JSON.toJSON(dto));      // dto 含 password、idCard

// ✅ 修复：只打业务关键字段
log.info("用户 - 创建 - 开始: name = {}, phone = {}", dto.getName(), desensitize(dto.getPhone()));
```

**问题**：日志用字符串拼接而非占位符

```java
// ❌ 字符串拼接：每次调用都构造字符串，即使日志级别关闭也有开销
log.info("岗位配置 - 创建 - 成功: id = " + entity.getId() + ", name = " + entity.getName());

// ✅ 占位符：日志级别关闭时跳过参数求值
log.info("岗位配置 - 创建 - 成功: id = {}, name = {}", entity.getId(), entity.getName());
```

**问题**：Service 中直接解析 JSON

```java
// ❌ 生成代码常见错误
JSONObject json = JSON.parseObject(entity.getConfig());
String value = json.getString("key");

// ✅ 修复：定义 DTO，通过 Convert 转换
JobConfigDetailDTO detail = jobConfigConvert.toDetailDTO(entity);
String value = detail.getKey();
```

**问题**：Controller 写了业务判断

```java
// ❌ 生成代码常见错误
if (dto.getStatus() == 1 && dto.getScore() > 60) {
    jobService.approve(dto.getId());
}

| 问题 | 关键判断 |
|------|----------|
| 方法体行数 30～100 行 | 超过 30 行须提取私有方法；超过 100 行必须拆分，阻断提交 |
| 文件行数 1000–1200 行 | 评估职责是否可拆分；超过 1200 行必须拆分，阻断提交（测试目录 warn=1500 / block=2500） |
| Service 反向依赖 | 低层 Service 注入高层 Service → 重新划分职责或提取公共层 |
| Service 平行域循环调用 | 允许平行域互调，出现循环依赖时在注入点加 `@Lazy` 打破 |
| Service 传入 HttpServletRequest | 改为在 Controller 层提取所需字段，以 DTO / 基础类型传入 Service |
| 跨微服务共享 Mapper/DB | 必须改为 Feign 接口或 MQ，禁止跨服务直接访问他服务数据库 |
| 任意字段缺少注释 | **所有字段必须有注释**，无论名称是否自解释；须标注含义、单位、取值范围或关联枚举 |
| 任意方法缺少 Javadoc | public/protected 含 `@param`/`@return`/`@throws`；private 至少一行意图说明 |
| 注释与代码语义脱节 | 代码改动后注释同步更新，禁止注释说旧语义 |
| 复杂逻辑缺少日志 | < 10 行无需；10～30 行：主链路 + 关键节点 1 条；30～100 行：主链路 + 关键节点多条 + 分支各 1 条 |
| 关键分支缺少日志 | `if-else`/`switch` 每条走向须有 1 条日志，说明分支原因 |
| 外部调用缺少日志 | Feign / Redis / MQ 调用前打入参，成功打结果，失败打 `warn/error` |
| 状态变更缺少日志 | 格式：`"业务名 - 状态变更: id = {}, oldStatus = {}, newStatus = {}"` |
| 幂等跳过缺少日志 | 已存在 / 无需更新的跳过分支须有 1 条 `info/debug` 说明原因 |
| 日志消息格式错误 | **无任何豁免**，统一三段式：`"业务名 - 操作 - 操作结果: key = {}, key2 = {}"`，`=` 两侧各一空格；启动/Configuration/工具类一律遵守 |
| 日志打印敏感字段 / 整包序列化 | 只打业务关键字段，密码/手机号脱敏 |
| 日志字符串拼接 | 必须用 `{}` 占位符 |
| Service 直接解析 JSON | 定义 DTO，通过 Convert 转换 |
| Controller 写业务逻辑 | 逻辑下沉到 Service |
| 路径参数不在末尾 | `/{id}/update` → `POST /update/{id}`；`/{id}/status` → `PATCH /status/{id}` |
| Service 跨域注入 Mapper | 通过目标域 Service 暴露方法，`@Lazy` 解决循环 |

---

## 常见边界情况

| 情况 | 处理 |
|------|------|
| 生成代码有字段但需求无对应说明 | 确认是臆造还是遗漏文档，臆造则删除 |
| 生成的枚举 code 值与已有枚举冲突 | 读 ERROR_CODE_DESIGN，重新规划 ZZZ 段 |
| 生成代码在正确层但命名不规范 | 按 CODE_STYLE 规范重命名，编译验证通过 |

---

## 脚本验证（AI 执行步骤完成后必须运行）

> **⛔ 核心铁律：以下 12 条脚本必须全部运行，不得选择性跳过。**
> 每条运行完毕后在对应复选框打 ✅，全部打完方可进入提交流程。
> 任一脚本输出 `❌ [ERROR]` 时，必须修复后重新运行该脚本，直至通过。

### 执行 Checklist（逐条运行，逐条确认）

- [ ] **1. Lombok 规范**
```bash
bash ~/cursor/skills/java-code-review/scripts/check-lombok.sh <模块路径>
```

- [ ] **2. 全局禁令**（@Autowired / System.out / 魔法数字等）
```bash
bash ~/cursor/skills/java-code-review/scripts/check-global-bans.sh <模块路径>
```

- [ ] **3. POJO 边界**（Entity/DTO/VO/Request/Response 禁用任何标量基本类型字段）
```bash
bash ~/cursor/skills/java-pojo/scripts/check-pojo.sh <模块路径>
```

- [ ] **4. common 模块标准用法**（BaseEntity / UUID / AsyncUtil / SysContext / Pageable）
```bash
bash ~/cursor/skills/java-code-review/scripts/check-common-usage.sh <模块路径>
```

- [ ] **5. common 模块复用**（日期常量 / is_deleted / 自定义响应体 / IBaseService）
```bash
python3 ~/cursor/skills/java-code-review/scripts/check-code-reuse.py <模块路径>
```

- [ ] **6. 文件 / 方法行数限制**
```bash
python3 ~/cursor/skills/java-code-review/scripts/check-size.py <模块路径>
```

- [ ] **7. 运行时资源安全**（OOM / 无界资源 / 外部调用 / 大日志 / 本地缓存 / Redis TTL）
```bash
python3 ~/cursor/skills/java-code-review/scripts/check-runtime-risk.py <模块路径>
```

提交审计中还会自动复用以下既有专项脚本，避免同类规则散落但未执行：

```bash
python3 ~/cursor/skills/java-service/scripts/check-transaction-boundary.py <模块路径>
bash ~/cursor/skills/java-mq/scripts/check-mq.sh <模块路径>
python3 ~/cursor/skills/java-mq/scripts/check-mq-advanced.py <模块路径>
bash ~/cursor/skills/java-mapper/scripts/check-mapper.sh <模块路径>
python3 ~/cursor/skills/java-mapper/scripts/check-n-plus-one.py <模块路径>
bash ~/cursor/skills/java-redis/scripts/check-redis.sh <模块路径>
```

- [ ] **8. Javadoc / @author / @since 格式**
```bash
python3 ~/cursor/skills/java-code-review/scripts/check-docs.py <模块路径>
```

- [ ] **9. 日志规范**（三段式 / 写操作 start+success / 查询禁 log.info）
```bash
python3 ~/cursor/skills/java-code-review/scripts/check-log-convention.py <模块路径>
```

- [ ] **10. 命名规范**（拼音 / 下划线前缀 / 常量大写 / 方法名过长）
```bash
bash ~/cursor/skills/java-code-review/scripts/check-naming.sh <模块路径>
```

- [ ] **11. 防御性编程**（嵌套深度 / 集合参数无保护 / 大 else 块）
```bash
python3 ~/cursor/skills/java-code-review/scripts/check-defensive.py <模块路径>
```

- [ ] **12. Eclipse JDT 格式化**（只格式化变更文件，禁止传模块目录）
```bash
# 对每个变更的 Java 文件逐一格式化（--fix 自动修复，不带则仅检查）
bash ~/cursor/skills/java-code-review/scripts/check-format.sh <具体文件路径> --fix

# 批量处理变更文件示例（在项目根目录执行）
git diff --name-only HEAD -- '*.java' | xargs -I{} bash ~/cursor/skills/java-code-review/scripts/check-format.sh "$(pwd)/{}" --fix
```

> ⚠️ **传目录会格式化该目录下全部 Java 文件，污染 git 变更记录，严禁在提交前使用。**

---

> `❌ [ERROR]` = 阻断，必须修复后重新运行 | `🟡 [WARN]` = 警告，评估处理 | `✅` = 通过
>
> 完整参考：[SCRIPTS_QUICK_REFERENCE.md](../SCRIPTS_QUICK_REFERENCE.md)

---

## 格式化引擎说明

### 架构

```
~/cursor/skills/java-code-review/scripts/formatter/eclipse-style.xml   ← skill 内置的 Eclipse JDT 格式配置
    ↓  formatter-maven-plugin 2.29.0（via 项目 mvnw）
格式化后的 .java 文件
```

无需任何转换步骤，配置文件直接被格式化引擎消费。

### 格式规则（来自 cursor.code-workspace.xml）

| 规则 | 值 |
|------|----|
| 缩进 | 4 空格（不使用 Tab） |
| 行宽 | 120 字符 |
| 大括号 | 同行（`end_of_line`） |
| if/else/catch | 不换行（`do not insert` new line） |
| 注释格式化 | Javadoc 格式化开启，行注释/块注释不格式化 |
| 保留空行 | 最多 2 行 |
| 换行策略 | 不强制 join（`join_wrapped_lines = false`） |

### 修改格式规则

1. 在 IDEA 中调整 `Settings → Editor → Code Style → Java`
2. 导出：齿轮图标 → `Export → Eclipse code style XML`（注意选 Eclipse 格式）
3. 覆盖 `~/cursor/skills/java-code-review/scripts/formatter/eclipse-style.xml`
4. 下次运行 `check-format.sh` 时立即生效，无其他操作

### 首次运行说明

第一次执行会从内网 Nexus 自动下载 `formatter-maven-plugin`（约 10 秒），后续缓存在 `~/.m2` 中，秒级完成。
