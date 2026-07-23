---
name: skill-lint
description: >-
  按 agentskills.io 规范自动检测 skill 目录的合规性，运行 Python 验证脚本并报告错误与修复建议。
  涵盖：name 格式校验、description 长度、compatibility 长度、文件引用深度、
  references/assets/ 子目录限制、SKILL.md 行数检查。
  适用于：检查 skill 是否合规、skill 格式验证、skill 发布前检测、skill lint、validate skill。
compatibility: Python 3.8+
metadata:
  domain: agent-skills
  layer: tooling
---

# Skill Lint（合规性检测）

按 [agentskills.io/specification](https://agentskills.io/specification) 自动检测 skill 目录是否合规。

---

## 使用方式

### 检测单个 skill

```bash
python3 scripts/validate.py /path/to/my-skill/
```

### 批量检测目录下所有 skill

```bash
python3 scripts/validate.py /path/to/skills/
```

### 显示详细信息（包含通过项）

```bash
python3 scripts/validate.py /path/to/my-skill/ --verbose
```

### 输出示例

```
──────────────────────────────────────────────────
  ❌ FAIL  my-skill
──────────────────────────────────────────────────
  ❌ name 'My-Skill' contains invalid characters (only lowercase a-z, 0-9, hyphens allowed)
  ❌ File reference 'references/service/XxxService.java' is more than one level deep (found 3 levels)
  ⚠️  description is very short (15 chars); include WHAT the skill does and WHEN to use it

  Summary: 2 error(s), 1 warning(s)
```

退出码：`0` = 全部通过（含 warning）；`1` = 存在 error。

---

## 检测清单（手动审查用）

以下情况脚本已自动检测，此处作为人工复查补充：

**Frontmatter**
- [ ] `name` 与目录名完全一致（大小写、拼写）
- [ ] `description` 同时描述 WHAT（能力）和 WHEN（触发场景），包含关键词
- [ ] `description` 第三人称写法（"Validates...", "Generates..."，非 "I can..."）

**Body**
- [ ] SKILL.md 正文 < 500 行
- [ ] 详细参考资料在 `references/` 中，而非内联大段模版
- [ ] 所有文件引用均为一层深度（`references/foo.md`，非 `references/sub/foo.md`）
- [ ] 引用的文件实际存在

**目录结构**
- [ ] 只使用 `references/`、`assets/`、`scripts/` 三个标准目录
- [ ] `references/` 和 `assets/` 内没有子目录

**内容质量**（脚本不检测）
- [ ] 包含分步骤指令
- [ ] 包含输入/输出示例
- [ ] 包含常见边界情况

---

## 常见错误与修复

| 错误信息 | 修复方式 |
|---------|---------|
| `name 'Foo-Bar' contains invalid characters` | 改为全小写：`foo-bar` |
| `name 'my-skill' does not match directory name 'myskill'` | 目录名与 name 字段对齐 |
| `description exceeds 1024 characters` | 精简描述，详细内容移到 references/ |
| `File reference 'references/sub/file.md' is more than one level deep` | 把文件移到 `references/` 直接层：`references/file.md` |
| `references/sub/ is a nested subdirectory` | 删除子目录，文件全部移到 `references/` |
| `Referenced file not found: 'references/MISSING.md'` | 创建该文件或修正引用路径 |
| `SKILL.md exceeds 500 lines` | 把详细内容（模版/表格）移到 references/ 文件 |

---

## 脚本验证（AI 执行步骤完成后必须运行）

```bash
# 检测单个 skill 目录合规性（SK-01/SK-05/SK-06/SK-07）
python3 ~/cursor/skills/skill-lint/scripts/validate.py <skill目录路径>
# 示例
python3 ~/cursor/skills/skill-lint/scripts/validate.py ~/cursor/skills/java-service

# 批量检测 skills 根目录下所有 skill（SK-02）
python3 ~/cursor/skills/skill-lint/scripts/validate.py ~/cursor/skills
# 显示详细信息（含通过项）
python3 ~/cursor/skills/skill-lint/scripts/validate.py ~/cursor/skills --verbose
```

> `❌ [ERROR]` = 阻断，必须修复 | `⚠️ [WARN]` = 警告 | 退出码 `0` = 全部通过 | `1` = 存在错误
>
> 完整参考：[SCRIPTS_QUICK_REFERENCE.md](../SCRIPTS_QUICK_REFERENCE.md)

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [SPEC_RULES.md](references/SPEC_RULES.md) | 完整规范规则与检测项对照表 |
| [validate.py](scripts/validate.py) | 自动化检测脚本 |
