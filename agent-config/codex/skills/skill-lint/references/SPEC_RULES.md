# agentskills.io 规范完整规则

来源：https://agentskills.io/specification

---

## 目录结构

```
skill-name/
├── SKILL.md          # 必须：元数据 + 指令
├── scripts/          # 可选：可执行脚本
├── references/       # 可选：参考文档
├── assets/           # 可选：模板、静态资源
└── ...               # 允许其他自定义目录
```

## SKILL.md 格式

```markdown
---
name: skill-name
description: 描述该 skill 做什么以及何时使用。
---

# 正文内容（Markdown）
```

---

## 字段规则

### `name`（必填）

| 规则 | 约束 |
|------|------|
| 长度 | 1–64 字符 |
| 字符集 | 仅小写字母 a-z、数字 0-9、连字符 `-` |
| 边界 | 不能以 `-` 开头或结尾 |
| 连续 | 不能包含连续连字符 `--` |
| 一致性 | **必须与父目录名称完全一致** |

合法示例：`pdf-processing`, `java-mq`, `code-review`

非法示例：`PDF-Processing`（大写），`-pdf`（连字符开头），`pdf--processing`（连续连字符）

### `description`（必填）

| 规则 | 约束 |
|------|------|
| 长度 | 1–1024 字符 |
| 内容 | 描述 WHAT（做什么）和 WHEN（何时使用） |
| 关键词 | 包含具体触发词，帮助 Agent 识别何时激活 |

好示例：
```yaml
description: Extracts text from PDF files, fills forms, merges documents.
  Use when working with PDFs or when the user mentions forms or document extraction.
```

差示例：
```yaml
description: Helps with PDFs.
```

### `license`（可选）

指定 skill 适用的许可证名称或文件引用。

### `compatibility`（可选）

| 规则 | 约束 |
|------|------|
| 长度 | 1–500 字符（如提供） |
| 内容 | 说明环境依赖（Python 版本、需要网络、特定工具等） |

注：大多数 skill 不需要此字段。

### `metadata`（可选）

任意 key-value 映射，用于存储附加属性：

```yaml
metadata:
  author: example-org
  version: "1.0"
```

---

## 正文内容建议

推荐包含以下章节：

1. 分步骤指令（Step-by-step instructions）
2. 输入/输出示例（Examples of inputs and outputs）
3. 常见边界情况（Common edge cases）

---

## 渐进式加载（Progressive Disclosure）

| 阶段 | 加载时机 | token 预算 | 内容 |
|------|---------|-----------|------|
| Metadata | 所有 skill 启动时 | ~100 tokens | `name` + `description` |
| Instructions | skill 被激活时 | < 5000 tokens 推荐 | 完整 SKILL.md 正文 |
| Resources | 按需加载 | 不限 | references/、assets/、scripts/ 文件 |

**规则：**
- SKILL.md 正文控制在 **500 行以内**
- 详细参考资料移到 `references/` 文件中

---

## 文件引用规则

从 SKILL.md 引用其他文件时，使用相对路径：

```markdown
详细说明见 [reference guide](references/REFERENCE.md)。
```

**关键约束：文件引用保持一层深度。避免深层嵌套引用链。**

合法：`references/RULES.md`, `assets/example.java`

非法：`references/service/XxxService.java`（两层深），`../other-skill/SKILL.md`（跨 skill）

---

## validate.py 检测项对照

| 检测项 | 错误级别 | 说明 |
|--------|---------|------|
| SKILL.md 不存在 | ❌ error | 必须有 SKILL.md |
| SKILL.md > 500 行 | ❌ error | 超出行数限制 |
| SKILL.md 300-500 行 | ⚠️ warning | 建议精简 |
| 缺少 `name` 字段 | ❌ error | 必填 |
| `name` > 64 字符 | ❌ error | 长度超限 |
| `name` 含非法字符 | ❌ error | 只允许 a-z 0-9 - |
| `name` 以 `-` 开头/结尾 | ❌ error | 边界非法 |
| `name` 含 `--` | ❌ error | 连续连字符非法 |
| `name` 与目录名不一致 | ❌ error | 必须完全匹配 |
| 缺少 `description` 字段 | ❌ error | 必填 |
| `description` > 1024 字符 | ❌ error | 长度超限 |
| `description` < 30 字符 | ⚠️ warning | 过短，建议补充 |
| `description` 无触发词 | ⚠️ warning | 建议加 "适用于" / "use when" |
| `compatibility` > 500 字符 | ❌ error | 长度超限 |
| 文件引用超过一层 | ❌ error | 引用路径过深 |
| 引用文件不存在 | ⚠️ warning | 文件缺失 |
| references/assets/ 内有子目录 | ❌ error | 不允许嵌套 |
| 非标准目录名 | ⚠️ warning | 规范只定义 references/ assets/ scripts/ |
