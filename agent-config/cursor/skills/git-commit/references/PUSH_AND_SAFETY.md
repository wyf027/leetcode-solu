# 推送降级与安全禁令

### 第六步：推送失败自动降级

当用户要求推送（`git push`）且推送到当前分支的远端失败时（如权限不足、受保护分支拒绝、冲突等），**必须自动执行以下降级流程**，无需额外询问用户是否降级：

#### 6.1 创建临时分支

根据本次提交的 type 前缀生成临时分支名：

```
<type>/<scope 或简要描述>-<YYYYMMDD-HHmmss>
```

示例：`feat/job-config-20260414-153012`、`fix/token-cache-20260414-160530`

```bash
ORIGINAL_BRANCH=$(git branch --show-current)
TEMP_BRANCH="<type>/<scope>-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$TEMP_BRANCH"
```

#### 6.2 推送临时分支并创建合并请求

```bash
git push -u origin "$TEMP_BRANCH"
```

推送成功后，使用 `gh` CLI 创建合并请求（Merge Request / Pull Request）：

```bash
gh pr create \
  --base "$ORIGINAL_BRANCH" \
  --head "$TEMP_BRANCH" \
  --title "<本次 commit message>" \
  --body "$(cat <<'EOF'
## 自动降级推送

原目标分支 `$ORIGINAL_BRANCH` 推送失败，已自动创建临时分支推送。

### 失败原因
<推送失败时的错误信息>

### 变更内容
<本次提交的变更说明>

Made-with: Cursor
EOF
)"
```

#### 6.3 回到原分支并清理

```bash
git checkout "$ORIGINAL_BRANCH"
git branch -D "$TEMP_BRANCH"      # 删除本地临时分支
```

#### 6.4 输出结果

向用户展示以下信息：

```markdown
⚠️ 推送降级完成

- 原目标分支：`dev`（推送失败）
- 失败原因：<错误摘要>
- 临时分支：`feat/job-config-20260414-153012`（已推送至远端）
- MR 目标分支：`dev`
- 合并请求：<MR/PR 链接>
- 本地已切回：`dev`
- 本地临时分支：已删除

请前往上方链接完成代码审查与合并。
```

#### 6.5 已有 MR 链接场景

当本次推送结果中已有 MR/PR 链接，或用户要求继续更新已有 MR/PR 时，必须显式确认并展示合并目标分支，避免因本地 upstream、默认分支或 CLI 推断错误导致合并方向错误。

```bash
MR_URL="<已有 MR/PR 链接>"
SOURCE_BRANCH="<MR/PR 源分支>"
TARGET_BRANCH="<MR/PR 目标分支>"

git push origin "$SOURCE_BRANCH"
```

> **【强制】不得使用裸 `git push` 更新已有 MR/PR**：必须显式写出 `origin` 与源分支；输出结果中必须同时展示 `SOURCE_BRANCH`、`TARGET_BRANCH` 和 `MR_URL`。
> 若无法从 MR/PR 链接或远端信息确认目标分支，必须先询问用户，不得凭默认分支推断。
> **【强制】手动创建 GitLab MR 的链接必须同时带源分支与目标分支参数**：`merge_request%5Bsource_branch%5D=<source>` 与 `merge_request%5Btarget_branch%5D=<target>` 缺一不可；禁止输出只带 `source_branch` 的 MR 创建链接。

#### 注意事项

- **仅在推送失败时触发**：推送成功则正常结束，不执行降级流程
- **临时分支命名必须可追溯**：包含 type、scope 和时间戳，便于识别来源
- **合并请求的 base 必须指向原目标分支**：确保合并方向正确
- **已有 MR/PR 必须显式目标分支**：更新 MR/PR 时必须展示源分支、目标分支和链接，禁止依赖默认 upstream 推断
- **GitLab MR 创建链接必须带 `target_branch`**：只带 `source_branch` 的 `/-/merge_requests/new` 链接会走默认目标分支，必须阻断并补齐目标分支参数
- **本地临时分支必须清理**：降级完成后立即删除，避免分支污染
- **若 `gh` CLI 不可用**：输出手动创建 MR 的指引（仓库 URL + 分支名），不得静默跳过

---

## 安全禁令

- **【绝对禁止】静默提交**：未经 AskQuestion 显式确认，任何情况下不得执行 `git commit`
- **【绝对禁止】未审先提**：未完成「前置步骤」且未输出"代码审查证据卡片"，任何情况下不得进入第零步及之后的流程
- **【绝对禁止】肉眼代审**：不得用"我看了文件，发现 XX 问题"代替 `run-audit.sh` 的真实执行；所有 `❌ ERROR / 🟡 WARN` 等级判定**必须**来自审计目录下的 `.log` 文件
- **【绝对禁止】伪造审计目录**：`AUDIT_DIR` 路径必须为 `run-audit.sh` 真实输出（格式：`/tmp/git-commit-audit-YYYYMMDD-HHMMSS-<pid>`），禁止凭空捏造路径或改写 `.log` 文件内容
- **【绝对禁止】伪造审查证据**：不得以"已审查"、"审查通过"等口头描述代替 `run-audit.sh` 的真实输出；证据卡片必须粘贴 `ls -la $AUDIT_DIR` 与各 `.log` 的 `tail` 真实结果
- **【绝对禁止】带 ERROR 提交**：`OVERALL_EXIT=1` 未修复时，禁止进入 AskQuestion 确认步骤；修复后必须**重跑** `run-audit.sh`（生成新的 AUDIT_DIR），不得复用旧 AUDIT_DIR
- **【绝对禁止】意图推断**：不得以"用户已明确表示要提交"为由跳过确认步骤或审查步骤
- **【绝对禁止】合并步骤**：不得将第四步（确认）与第五步（执行）合并，确认与执行必须严格分离
- **禁止** `git push --force` 到 main/master，如用户要求须先警告
- **禁止** `--no-verify` 跳过 hook，除非用户明确要求
- **禁止** `git commit --amend` 修改已推送到远端的提交
- **禁止** 输出缺少 `target_branch` 的 GitLab MR 创建链接，任何只带 `source_branch` 的 `/-/merge_requests/new` 链接必须先补齐目标分支

---

## 快速参考

| 场景 | 处理方式 |
|------|----------|
| 未执行代码审查 | ⛔ 阻断：回到「前置步骤」执行审查并输出证据卡片，不得进入后续任何步骤 |
| 审查存在 `❌ [ERROR]` | ⛔ 阻断：先修复再重跑审查通过，禁止进入 AskQuestion |
| 审查存在 `🟡 [WARN]` | 在 AskQuestion 中显式列出，由用户决定是否接受 |
| 用户要求"跳过代码审查" | 通过 AskQuestion 二次确认风险，并把豁免记录写入提交确认上下文 |
| 暂存区为空 | 提示"无已暂存变更，请先 `git add`" |
| 变更文件超过 20 个 | 提示是否拆分为多次提交（单 MR 建议控制在 10 文件 / 400 行以内） |
| 包含 `.env` / 密钥文件 | 警告用户，建议加入 `.gitignore` |
| 含调试代码（`System.out` 等） | 警告用户，建议先清理 |
| 当前分支为 `dev` / `test` / `main` | ⛔ 警告：受保护分支，禁止直接提交，应切功能/修复分支 |
| 提交信息含 "临时"、"WIP"、"待完善"、"暂存" 等 | ⚠️ 警告：禁止将 Git 当备份工具，请整理为有意义的提交信息 |
| AI 辅助编写本次变更 | 在 footer 自动追加 `Made-with: Cursor` |
| 推送到远端分支失败 | 自动创建临时分支推送 + 创建 MR + 切回原分支 + 删除本地临时分支 |
| GitLab MR 创建链接缺少 `target_branch` | ⛔ 阻断：补齐 `merge_request%5Btarget_branch%5D=<目标分支>`，禁止依赖默认目标分支 |

---
