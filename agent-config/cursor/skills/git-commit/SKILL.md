---
name: git-commit
description: >-
  在执行 git commit 前强制完成代码审查并输出审查证据卡片，再输出变更明细与统计，通过 AskQuestion 工具取得用户显式确认后方可提交，严禁未审先提与静默提交。
  涵盖：前置代码审查（Java 运行时资源安全 + 规范检查 + 格式化 / SQL / YAML / 前端 lint / 密钥扫描）、审查证据卡片、变更文件清单、增删行统计、提交信息格式（Conventional Commits）、分支确认、受保护分支检查、暂存区检查、WIP 提交警告、推送失败自动降级（创建临时分支 + MR）。
  适用于：git commit、提交代码、代码审查后提交、生成 commit message、提交变更、查看提交统计、确认提交内容、推送失败降级、自动创建合并请求。
compatibility: 通用
---

# Git 提交规范

> **⛔ 核心铁律 1：严禁任何静默提交。**
> 无论何种情形——包括用户说"帮我提交"、"直接提交"、"提交吧"——在收到用户通过 AskQuestion 的显式确认之前，**绝对不得执行 `git commit`**。
> 用意图推断替代确认、省略确认步骤、以任何理由跳过第四步，均属违规。
>
> **⛔ 核心铁律 2：严禁未审查先提交。**
> 任何 `git commit` 之前，**必须先完成代码审查**，并在第二步的"变更明细"中输出"代码审查证据卡片"。
> 未输出审查证据、审查存在 `❌ [ERROR]` 未修复、或跳过审查直接进入 AskQuestion 确认环节，均属违规。
> 仅在用户明确说出"跳过代码审查"并经 AskQuestion 二次确认知晓风险后，方可豁免。

**【强制】执行任何 git commit 之前，必须先完成「前置步骤（代码审查 + 格式化）」→ 输出变更明细与统计 → 通过 AskQuestion 工具向用户确认，方可提交。三个环节缺一不可。**

---

## 执行流程

### 前置步骤【强制阻断】：代码审查 + 格式化

> **本步骤为提交阻断步骤**：未完成且未输出"审查证据卡片"前，禁止进入第零步及之后的任何步骤。

#### A. 代码审查【一键脚本，禁止肉眼代审】

**【强制】必须通过以下一条命令执行审查，所有结果落盘到审计目录，禁止用任何"已肉眼审查"等口头描述代替**：

```bash
bash ~/.cursor/skills/git-commit/scripts/run-audit.sh
```

该脚本会自动：
1. 按变更文件类型分流执行：
   - **Java 类**（`.java` 变更触发）：`check-global-bans` / `check-lombok` / `check-naming` / `check-size` / `check-runtime-risk` / `check-transaction-boundary` / `check-mq` / `check-mq-advanced` / `check-n-plus-one` / `check-redis`
     - `RR-01` 大文件 / 外部流全量读入内存（如 `readAllBytes()`）直接阻断，避免 OOM
     - `RR-02` 无界队列 / 无界线程池 / 无限循环直接阻断
     - `RR-05` JVM 本地共享状态缓存直接阻断，多实例场景必须走 Redis / DB / MQ 幂等
     - `RR-06` Redis 缓存缺 TTL 直接阻断
     - `PR-01~PR-07` SQL 注入、幂等缺失、租户隔离、事务内外部调用、异常吞掉、敏感字段暴露等生产风险进入审计
   - **Mapper XML**（`.xml` 变更触发）：`check-mapper` / `check-runtime-risk`
     - 阻断 `${}` SQL 拼接，提示缺少租户隔离条件的 Mapper XML
   - **领域专项扫描**（`.java` 变更触发）：
     - `check-transaction-boundary`：多写缺事务、写库 + MQ 一致性风险
     - `check-mq` / `check-mq-advanced`：Listener 规范、吞异常、入参校验、发送日志
     - `check-n-plus-one` / `check-mapper`：循环查库、IN 空集合、批量写入、Mapper 继承
     - `check-redis`：直接注入 RedisTemplate、Redis key 硬编码、缓存缺 TTL
   - **密钥扫描**（任何文本变更触发）：`check-secrets`
   - **推送目标分支检查**（Markdown / Shell 等文档与脚本变更触发）：`check-push-target`
     - `GC-PUSH-01` 所有 `git push` 示例必须显式写出 `origin` 与源分支
     - `GC-PUSH-02` 输出 MR/PR 链接时必须在附近展示目标分支
     - `GC-PUSH-03` GitLab MR 创建链接（`/-/merge_requests/new?...source_branch...`）必须在 URL 中显式包含 `target_branch` 参数，禁止依赖默认目标分支
   - **version 项目专项检查**（变更路径含 `antview/` 版本目录即触发，兼容 `*version/antview/*` 与版本仓内相对路径 `antview/*`）：`check-version`
     - `FILE-01` 版本仓 `脚本/` 目录下**仅允许 `.sql`**；禁止 `.py`/`.sh`/`.js`/`.ts` 等一次性工具脚本混入（产出已固化进 SQL 的脚本本身不应长期留存）
     - `ENV-01` Nacos 配置变量必须在 `<version>/配置/env.properties` 集中维护
     - `SQL-01` 非大型脚本（≤ 2 MiB）必须按服务聚合到 `<service>.sql`
     - `SQL-02` 增量 SQL 必须务实级幂等（CREATE/DROP/ADD COLUMN 必须 IF [NOT] EXISTS；INSERT 业务初始化必须 ON CONFLICT；裸 ALTER 须包 `DO $$` + 存在性判断仅 WARN）
2. 创建审计目录 `/tmp/git-commit-audit-<时间戳>-<pid>/`，**每个审查脚本的 stdout/stderr/exit-code 完整落盘**为独立 `.log` 文件
3. 输出末尾必含以下字段（必须原样进入证据卡片）：
   - `AUDIT_DIR=<完整路径>`
   - 每项 `<CHECK>_EXIT=<码>`（含 `VERSION_EXIT`，未触发时该项不出现）
   - `OVERALL_EXIT=0|1`（**1 必须阻断提交**）

> **【强制】零容忍伪造**：
> - ❌ 禁止凭肉眼判断输出"❌ ERROR / 🟡 WARN"标签——所有等级判定**必须**直接来自 `.log` 文件
> - ❌ 禁止跳过 `run-audit.sh` 而声称"已审查"
> - ❌ 禁止在未运行脚本的情况下捏造 `AUDIT_DIR` 路径
> - ❌ 禁止改写 `.log` 文件内容后再粘贴到证据卡片
>
> 验证手段：审计目录中的每个 `.log` 文件可被父 agent / 用户独立通过 `cat` 抽查；伪造极易被识破。

> **【强制】OVERALL_EXIT 处理规则**：
> - `OVERALL_EXIT=0` 且无 WARN：可进入第零步
> - `OVERALL_EXIT=0` 但有 WARN：可进入第零步，须在第四步 AskQuestion 显式列出 WARN
> - `OVERALL_EXIT=1`：⛔ 阻断，必须修复后**重新运行 `run-audit.sh`**（生成新的 AUDIT_DIR）至 OVERALL_EXIT=0 才能继续

#### B. 格式化（仅对变更的 Java 文件）

```bash
git diff --name-only HEAD -- '*.java'

bash ~/.cursor/skills/java-code-review/scripts/check-format.sh <具体文件路径> --fix
```

> ⚠️ **禁止传模块目录**，否则会格式化整个模块所有文件，污染 git 变更记录。必须逐文件传入。

#### C. 豁免条件（满足任一方可跳过 A 步）

| 条件 | 说明 |
|------|------|
| 变更文件全部为非代码非文本文件（图片、二进制等） | 仍须运行 `run-audit.sh`（脚本内部会按类型分流，无可审项时自动跳过） |
| 用户在本轮对话中**明确**说出"跳过代码审查" | 须在 AskQuestion 中二次确认风险，并把豁免原因写入证据卡片 `备注` 列 |

> 任何"我已看过"、"应该没问题"、"上一轮提交已审查"、"文件很小一眼能看出问题"等理由，**均不构成豁免依据**。

---

### 第零步：同步远端代码（提交前必须执行）

**【强制】在执行任何 `git commit` 之前，必须先将远端最新代码同步到本地，防止提交后出现合并冲突。**

```bash
git stash push -u -m "pre-commit sync stash"
git pull origin <当前分支>
git stash pop
```

> **stash pop 产生冲突时**：须先手动解决冲突，确认本地变更与远端代码兼容后，再继续后续提交步骤。不得跳过此步骤直接提交。

**可跳过场景**（满足任一即可跳过）：

| 条件 | 说明 |
|------|------|
| `git status` 显示本地与远端完全一致 | 无需同步 |
| 初始化空仓库首次提交 | 远端无历史可拉取 |
| 当前为离线环境，无法访问远端 | 需向用户说明风险后跳过 |

---

### 第一步：收集变更信息

依次执行以下命令，收集完整的提交上下文：

```bash
git branch --show-current
git diff --cached --name-status
git diff --cached --stat
git status --short
```

**【强制】受保护分支检查**：若当前分支为 `dev`、`test` 或 `main`，必须立即警告用户：

> ⛔ 当前分支 `xxx` 为受保护分支，禁止在此分支上直接提交。
> 请按规范从该分支切出功能/修复分支后再提交：
> - 新功能：`git checkout -b feat/xxx`
> - Bug 修复：`git checkout -b fix/xxx`
> - 紧急线上修复：`git checkout -b hotfix/xxx`（须从 `main` 切出）

并**暂停后续步骤**，等待用户确认是否继续（例外：用户明确表示知晓风险并强制提交时，才可继续）。

### 第二步：输出变更明细

按 [COMMIT_TEMPLATE.md](references/COMMIT_TEMPLATE.md) 中的格式向用户展示变更摘要，**不得跳过任何区块**。

### 第三步：起草提交信息

按 [COMMIT_TEMPLATE.md](references/COMMIT_TEMPLATE.md) 中的 Conventional Commits 格式起草 commit message。

### 第四步：向用户确认

使用 **AskQuestion 工具**展示以下问题，**等待用户回应后再执行提交**：

```
问题 1：提交信息是否正确？
  - 确认，直接提交
  - 修改提交信息后提交（请在聊天框告知新的信息）
  - 取消提交

问题 2（如有未暂存文件）：检测到未暂存的变更，是否一并加入？
  - 是，执行 git add . 后提交
  - 否，仅提交已暂存文件

问题 3（如审查存在 🟡 [WARN] 或用户要求跳过审查时必问）：
  - 接受当前审查结果并继续提交
  - 取消提交，回去修复 WARN
```

> **【强制】问题 1 与问题 3 不得合并**。审查存在任何 `❌ [ERROR]` 时禁止进入本步骤，必须回到前置步骤修复后重跑。

### 第五步：执行提交

用户确认后，执行：

```bash
git add .           # 仅当用户选择"一并加入"时执行
git commit -m "$(cat <<'EOF'
<confirmed commit message>
EOF
)"
git status          # 验证提交成功
```

### 第六步：推送失败自动降级

推送失败、受保护分支、已有 MR 更新、安全禁令与快速参考，统一按 [PUSH_AND_SAFETY.md](references/PUSH_AND_SAFETY.md) 执行。

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [COMMIT_TEMPLATE.md](references/COMMIT_TEMPLATE.md) | 变更明细输出格式、Conventional Commits 类型表、提交成功输出格式 |

---

## 脚本验证（安装钩子 / 手动触发）

```bash
# 一键安装 pre-commit + commit-msg 钩子（仓库根目录执行）
bash ~/cursor/skills/git-commit/scripts/pre-commit --install

# 手动触发完整检查（模拟 pre-commit 行为）
bash ~/cursor/skills/git-commit/scripts/pre-commit

# 单独检查代码中的硬编码密码 / Token / 内网 IP
bash ~/cursor/skills/git-commit/scripts/check-secrets.sh <模块路径>

# 单独验证 commit message 格式
bash ~/cursor/skills/git-commit/scripts/check-commit-msg.sh <commit-msg文件>
# 示例
bash ~/cursor/skills/git-commit/scripts/check-commit-msg.sh .git/COMMIT_EDITMSG
```

> `❌ [ERROR]` = 阻断提交，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
>
> 完整参考：[SCRIPTS_QUICK_REFERENCE.md](../SCRIPTS_QUICK_REFERENCE.md)
