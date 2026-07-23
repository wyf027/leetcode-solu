---
name: agent-guardrails
description: Applies cross-task guardrails before using implementation skills. Clarifies ambiguous requirements, prefers the smallest change that solves the request, limits edits to directly relevant code, and defines verification steps. Use when coding, refactoring, debugging, reviewing code, or handling any task that may trigger multiple skills.
compatibility: 通用
metadata:
  domain: agent-skills
  layer: guardrails
---

# Agent Guardrails

在调用具体领域 skill 之前，先用本 skill 收敛任务边界。它是上层约束，不替代 `java-*`、`git-commit`、`skill-lint` 等现有规范。

## 参考文件

| 文件 | 用途 |
|------|------|
| [QUICK_EXAMPLES.md](references/QUICK_EXAMPLES.md) | 何时先问、何时直接做、何时需要短计划的快速示例 |

---

## 核心原则

1. **先澄清，再实现**
   - 需求有歧义、关键输入缺失、存在两种以上合理实现时，先提炼分歧点，再向用户确认。
   - 禁止默认脑补字段、接口、流程、依赖、边界条件。
   - 若任务很小且上下文充分，可直接做，不为问而问。

2. **优先最小方案**
   - 先选能满足当前需求的最小改动，不预埋未来扩展。
   - 不为单次使用提前抽象，不为可能发生的场景增加配置项。
   - 若“完整分层方案”和“小步修改方案”都成立，默认先选更小的一种；除非团队规范强制要求完整分层。

3. **只改必要范围**
   - 只修改与当前请求直接相关的代码、注释、测试、配置。
   - 不顺手重构邻近模块，不清理历史问题，不统一格式化无关文件。
   - 若发现邻近代码存在可优化项，可以提醒用户，但未经确认不要自动扩大改动范围。
   - 只清理由本次改动直接产生的无用 import、死变量、失效分支。

4. **定义完成标准**
   - 动手前先明确“做到什么算完成”，优先写成可验证条件。
   - 能用测试证明的，优先用测试；不能加测试的，至少给出明确检查项。
   - 未验证前，不把任务视为完成。

---

## 使用顺序

### 第一步：任务归类

先判断当前任务属于哪类：

- **信息不足**：先澄清，不直接编码
- **单点小改**：直接做最小改动
- **多文件实现**：先给出 2-4 步短计划，再动手
- **代码审查**：优先找 bug、回归风险、缺失测试，风格问题靠后
- **流程操作**：再交给 `git-commit` 等专用 skill

### 第二步：选择后续 skill

本 skill 只负责收敛，真正落地时继续调用具体 skill：

- Controller 问题 → `java-controller`
- Service / Convert / 事务 → `java-service`
- Redis → `java-redis`
- MQ → `java-mq`
- 测试设计 → `java-testing`
- 代码审查 → `java-code-review`
- Skill 编写 → `create-skill` / `skill-lint`

### 第三步：声明执行策略

在开始修改前，先在心里确认以下四件事：

- 我是否缺少必要信息？
- 有没有更小的实现方式？
- 我将修改哪些文件，哪些文件不该碰？
- 我准备如何验证？

---

## 默认工作流

### 1. 澄清检查

满足任一条件就先问用户：

- 需求中的对象、字段、接口名不明确
- 用户只说“改一下”“优化一下”“支持一下”，但没说明成功标准
- 存在明显 trade-off，例如“快速打补丁”与“完整重构”都可行
- 修改可能影响数据库、缓存、MQ、外部接口等高风险面

### 2. 最小实现检查

实现前优先问自己：

- 能否复用现有 DTO / VO / Convert / 工具类？
- 能否在原有方法内小改，而不是扩出新抽象？
- 能否只改一层，而不是把 Controller / Service / Mapper 全链路重写？
- 能否只补一个针对性测试，而不是铺一套低价值测试？

### 3. 变更边界检查

只允许扩大改动范围的场景：

- 当前改动若不顺带补齐，代码将无法编译 / 无法运行
- 当前改动直接导致测试、配置、文档失效
- 团队规范明确要求成套调整，例如新增对外接口必须同步 DTO / VO / 测试

除此之外，一律不要做“顺手优化”。

### 4. 验证检查

至少满足一项：

- 相关测试新增或通过
- 关键路径能被命令、日志、静态检查验证
- 能明确列出人工验证步骤和预期结果

若无法验证，必须在交付时明确说明风险。

### 5. 运行时安全影响检查

以下场景一律视为高风险实现，不能只按功能验收，必须在实现前后显式检查资源边界：

- 文件 / 视频 / 音频 / 简历 / 附件上传下载、导入导出
- 外部 HTTP / SDK 调用、第三方回调、Webhook
- MQ 发送 / 消费、定时任务、批量处理
- Redis 缓存、幂等、限流、分布式锁
- 多实例共享状态、跨请求状态、长时间等待 / 轮询

高风险实现的最低要求：

- 禁止无上限堆内存加载：如 `readAllBytes()`、`toByteArray()`、大对象 `byte[]` 中转
- 禁止无界资源：无界队列、无界线程池、无限循环、无限重试
- 外部调用必须有超时、关闭、失败降级或错误传播策略
- 跨请求共享状态必须使用 Redis / DB / MQ 幂等，不得用 JVM 本地字段缓存
- 缓存必须有 TTL
- 日志只打关键字段、长度、摘要，不打整包 body / DTO / Entity / 大 JSON
- MQ 消费和第三方回调必须有幂等策略，不能假设上游只调用一次
- 数据访问必须确认租户隔离条件，Controller 不得信任前端传入的 companyId
- 禁止 SQL 拼接高危写法（MyBatis `${}`、未白名单的 `.last()` / `.apply()`）
- 异常处理不能吞掉失败后返回成功，除非有失败状态、失败通知或补偿策略

交付前若存在 Java 变更，优先运行：

```bash
python3 ~/.cursor/skills/java-code-review/scripts/check-runtime-risk.py <变更文件或模块路径>
```

---

## 输出偏好

### 需要提问时

用最少问题锁定分歧点，不铺陈大段背景。优先问：

1. 目标行为是什么？
2. 范围到哪一层？
3. 成功标准是什么？

### 需要计划时

计划控制在 2-4 步，每步都带一个验证点。

示例：

```markdown
1. 定位现有实现与影响面 → 验证：确认只需改 `service` 和 `test`
2. 做最小代码改动 → 验证：关键分支逻辑符合预期
3. 补充或运行针对性验证 → 验证：测试/检查通过
```

### 需要交付时

优先说明：

- 完成了什么
- 如何验证
- 还有什么未验证风险

不要把回答写成冗长变更日志。

---

## 与现有 skills 的关系

- 本 skill **优先级更高**：先收敛任务，再调用具体 skill。
- 本 skill **不覆盖领域规范**：进入 Java / Redis / MQ / Git 场景后，仍必须遵循对应 skill。
- 当“最小改动”与“团队硬性规范”冲突时，**团队规范优先**。

---

## 常见误区

| 误区 | 正确做法 |
|------|----------|
| 用户没说清，但先按自己理解实现 | 先问缺失信息或明确假设 |
| 小需求也整套新增 DTO/VO/Convert/Helper | 先判断是否能复用，优先最小方案 |
| 看到邻近代码不规范就顺手一起改 | 先提醒用户，由用户决定是否纳入本次任务 |
| 觉得“应该没问题”就结束 | 至少做一个明确验证 |
| 代码评审先挑命名和格式 | 先找 correctness、回归风险、测试缺口 |

---

## 快速检查清单

- [ ] 我没有脑补需求
- [ ] 我选择了最小可行方案
- [ ] 我只改了必要文件
- [ ] 我有明确验证方式
- [ ] 我没有绕过现有团队 skill

---

## 脚本验证（任务开始前可选运行）

```bash
# AG-01：检查任务描述是否含歧义关键词
bash ~/cursor/skills/agent-guardrails/scripts/check-task-scope.sh --task "任务描述文本"

# AG-02：检查本次 git diff 变更范围是否过大（默认阈值 10 个文件）
bash ~/cursor/skills/agent-guardrails/scripts/check-task-scope.sh --diff

# AG-01 + AG-02 组合检查
bash ~/cursor/skills/agent-guardrails/scripts/check-task-scope.sh \
  --task "任务描述" \
  --diff --threshold 15
```

> `❌ [ERROR]` = 阻断，必须先澄清或拆分任务 | `🟡 [WARN]` = 建议确认后再继续
