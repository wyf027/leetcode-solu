# 变更明细与提交信息模版

## 变更明细输出格式

以下面的格式向用户展示变更摘要，**不得跳过任何区块**：

```markdown
## 提交变更明细

**分支**：`feature/xxx`
**目标仓库**：origin

### 代码审查证据【强制，不得伪造】

> 本区块的所有内容必须直接来自 `run-audit.sh` 的真实执行输出与审计目录下的 `.log` 文件。
> 禁止凭肉眼判断写出 ❌ ERROR / 🟡 WARN 标签；禁止凭空捏造 `AUDIT_DIR` 路径；禁止改写 `.log` 内容。

**审计执行命令**：

```bash
bash ~/.cursor/skills/git-commit/scripts/run-audit.sh
```

**审计目录**：`/tmp/git-commit-audit-<YYYYMMDD-HHMMSS>-<pid>`
**总体阻断标志**：`OVERALL_EXIT=0`（0 = 可继续，1 = 必须阻断）

#### A. 审计目录核验

> 直接粘贴 `ls -la $AUDIT_DIR` 的真实输出（禁止改写文件名 / 大小 / 时间戳）：

```
$ ls -la /tmp/git-commit-audit-<...>
total ...
-rw-r--r-- 1 user staff  XXXX <date> check-global-bans.log
-rw-r--r-- 1 user staff  XXXX <date> check-secrets.log
... 其余 .log / meta.txt / files.txt / summary.txt ...
```

#### B. 各脚本结果汇总

| 审查项 | 落盘文件 | EXIT | 摘要（来自 .log 末尾汇总行） | 备注 |
|--------|----------|------|------------------------------|------|
| Java 全局禁令（CR-01~22, 31） | `check-global-bans.log` | 0/1 | 例：`❌ 检查完成：1 个阻断错误，0 个警告` | 仅 .java 变更触发 |
| Lombok 使用规范 | `check-lombok.log` | 0/1 | 直接抄 .log 末尾 | 仅 .java 变更触发 |
| 命名规范 | `check-naming.log` | 0/1 | 直接抄 .log 末尾 | 仅 .java 变更触发 |
| 文件 / 方法行数 | `check-size.log` | 0/1 | 直接抄 .log 末尾 | 仅 .java 变更触发 |
| 密钥扫描（CR-27~30） | `check-secrets.log` | 0/1 | 例：`❌ 发现 1 处敏感信息，提交被阻断` | 任何文本变更触发 |
| 推送目标分支检查（GC-PUSH-01~03） | `check-push-target.log` | 0/1 | 例：`❌ check-push-target 完成：1 个阻断错误` | Markdown / Shell 等文档与脚本变更触发 |
| version 项目专项（ENV-01 / SQL-01 / SQL-02） | `check-version.log` | 0/1 | 例：`❌ check-version 完成：7 个阻断错误，3 个警告` | 仅当变更路径含 `version/antview/` 触发，否则不出现 |
| Java 格式化（如有 .java 变更） | 命令输出（非脚本） | — | 例：`格式化 3 个文件` | 单独 `check-format.sh --fix` 输出 |
| 用户豁免（如适用） | — | — | — | "用户豁免：<原因>" |

#### C. 关键日志尾部【必填】

> 对每个 `EXIT != 0` 的脚本，**必须**贴出对应 `.log` 文件 `tail -20` 的真实内容。
> `EXIT == 0` 的脚本至少贴 `tail -3`（确认看到"全部通过"或"PASS"汇总行）。

```
$ tail -20 /tmp/git-commit-audit-<...>/check-global-bans.log
... 真实输出（含颜色码 / emoji 也保留）...
```

```
$ tail -20 /tmp/git-commit-audit-<...>/check-secrets.log
... 真实输出 ...
```

> ⛔ **OVERALL_EXIT=1 时，禁止进入 AskQuestion 确认环节**，必须修复后**重跑 `run-audit.sh`**（生成新 AUDIT_DIR）。
> 🟡 OVERALL_EXIT=0 但有 WARN 时，须在 AskQuestion 第 3 题中由用户显式确认是否接受。
> 用户已豁免审查时，请在 B 表"备注"栏注明"用户豁免：<原因>"，并在 AskQuestion 中二次确认风险。

### 变更统计

| 项目 | 数量 |
|------|------|
| 变更文件数 | N 个 |
| 新增行数   | +N  |
| 删除行数   | -N  |

### 变更说明

> 按"因为 **[触发原因]**，所以变更了 **[变更内容]**"的句式，逐条说明本次提交的动机与影响。
> 每条对应一个独立的改动意图，不得合并不相关的改动为一条。

- 因为 **需求 / Bug / 重构目标 xxx**，变更了 **yyy 模块 / 方法 / 配置**，具体表现为 **zzz**
- 因为 **...** ，变更了 **...**

### 变更文件清单

| 状态 | 文件路径 |
|------|----------|
| A（新增） | src/main/java/... |
| M（修改） | src/main/java/... |
| D（删除） | src/main/java/... |
| R（重命名） | old → new |

> ⚠️ 以下文件有变更但**未暂存**，如需提交请先 `git add`：
> - src/xxx/yyy.java
```

> 状态缩写说明：A = Added，M = Modified，D = Deleted，R = Renamed，C = Copied
>
> **变更说明生成策略**：优先从本次对话上下文（需求描述、Bug 单、重构目标）中提取原因；若上下文不足，根据 `git diff --cached` 的实际改动内容推断，并在说明前标注"（推断）"以提示用户核对。

---

## Conventional Commits 格式

```
<type>(<scope>): <subject>

[optional body]
```

**type 选型**：

| type | 适用场景 |
|------|----------|
| `feat` | 新增功能 |
| `fix` | 修复 Bug |
| `hotfix` | 紧急线上修复（从 main 切出的 hotfix 分支） |
| `refactor` | 重构（非功能变更） |
| `chore` | 构建/依赖/配置/Docker 调整 |
| `docs` | 文档变更 |
| `test` | 测试用例 |
| `style` | 格式调整（不影响逻辑） |
| `perf` | 性能优化 |

**scope** 填写模块名，常用值：`hire-service`、`hire-api`、`hire-web`、`assess-service`、`assess-api`、`platform-service`、`system-service`、`integration-service`、`docker`、`auth` 等。

**subject** 规则：
- 动宾结构，≤ 50 字符
- 中文描述（与项目语言一致）
- 不以句号结尾

**footer（可选）**：
- AI 辅助编写的提交，在 footer 中附加 `Made-with: Cursor`

示例：
```
feat(job-config): 新增岗位配置状态流转接口
fix(auth): 修复 token 过期未清除缓存问题
hotfix(assess-service): 修复评分计算除零异常
refactor(hire-service): 提取 JobConfig 状态校验为私有方法

Made-with: Cursor
```

---

## 提交成功输出格式

```markdown
✅ 提交成功

- commit：`abc1234`
- 分支：`feature/xxx`
- 提交信息：`feat(xxx): yyy`
```
