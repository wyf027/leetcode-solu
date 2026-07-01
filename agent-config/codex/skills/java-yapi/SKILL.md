---
name: java-yapi
description: >-
  通过 HTTP 调用 YApi 服务端接口实现接口管理自动化，规范 OpenAPI 同步流程与清理要求。
  涵盖：导入接口数据、运行自动化测试、新增/保存/更新/查询接口、获取接口列表与菜单、新增接口分类、获取分类列表、
  全量重建 / 增量同步两种模式；同步 OpenAPI 时 summary 须为「业务名称 - 操作」格式；同步结束后须清理全部临时文件。
  适用于：调用 YApi API、yapi 接口管理自动化、同步接口、导入 swagger、增量更新单个/部分接口、
  仅修改 summary 或字段、运行 yapi 自动测试、新增接口分类、获取 yapi 接口列表、批量操作 yapi 接口。
compatibility: Python 3.6+, YApi 1.x
metadata:
  domain: yapi
---

# YApi API 操作规范

> AI 生成 `yapi.json` 时，**必须先读取 [GENERATION_RULES.md](references/GENERATION_RULES.md)** 了解类型映射和 Mock 规则，再读取 [openapi3-template.json](references/openapi3-template.json) 对照骨架结构，参考 [user-crud-yapi.json](assets/user-crud-yapi.json) 或 [job-config-yapi.json](assets/job-config-yapi.json) 了解完整写法。

> **【禁止使用缓存】** 每次同步前，AI **必须**重新读取所有相关源码文件（Controller、Service、Entity、DTO/VO、Enum 等）来生成 `yapi.json`，**严禁**复用任何本次对话之前已生成过的 JSON 内容或记忆中的旧版 JSON 片段。若源文件未发生变化，仍需重新读取以确保准确性；**只有从源码实时推导出的 OpenAPI 文档才可提交同步**。

---

## 接口名称（summary）命名（强制）

同步导入 YApi 时，OpenAPI 的 **`summary` 即 YApi 接口标题**。所有接口的 `summary` **必须**统一为：

**`业务名称 - 操作`**

- **业务名称**：领域对象或业务模块（如职位、简历、职位配置、招聘工作台），与 Controller 资源或 YApi 分类语义一致；宜简短。
- **操作**：动宾或动词短语，说明本接口做什么（如新增、分页查询、详情查询、删除、发布、状态更新）；复合场景可用「搜索」「统计」等。
- **补充说明**：必要时的场景、约束、参数提示写在 **操作后面的括号内**，不改变「业务 - 操作」主结构。

示例：

| 合规 | 不合规 |
|------|--------|
| `职位 - 新增` | `新增职位` |
| `简历 - 分页查询` | `分页查询简历列表` |
| `职位 - 详情查询` | `获取职位详情` |
| `职位配置 - 保存或更新（含三步向导）` | `保存或更新职位配置（含基本信息…）`（缺少「 - 」分隔） |

生成前应对照本规则逐条检查 `paths` 下每个方法的 `summary`。

---

## 分页与列表项 schema（强制）

YApi 从 OpenAPI 导入时，对**匿名结构**支持很差：若分页里的列表项写成 **`items: { "type": "object" }`**、或 **`$ref` 指向的 schema 只有空 `properties: {}`**，界面里常出现 **「有分页壳、无列表元素字段」**，即层级丢失。

**必须遵守：**

| 规则 | 要求 |
|------|------|
| **列表项必须具名 `$ref`** | `data.records`（或项目实际 JSON 中的列表字段，如个别老接口仍为 `list`）的 **`items`** 只能是 **`"$ref": "#/components/schemas/某DTO"`**，禁止匿名 `object`。 |
| **DTO 必须写全字段** | 被引用的 `某DTO` / `某VO` 须按 Java 类 **`properties` 写全**（含 `description` / `example` / `mock` 等，与 POJO 规范一致），**禁止**用空对象占位当列表元素类型。 |
| **分页体与 `Paged` 一致** | 与 `com.succaiss.commons.base.dto.Paged` 序列化一致时，`data` 使用 **`records`、`total`、`size`、`current`、`pages`**；query 分页参数与 **`Pageable`** 一致时用 **`current`、`size`**（及可选 `sortField`、`sortOrder`、`lastId`）。若某接口实际 JSON 仍用 `list` / `pageNum` / `pageSize`，须与真实响应一致，但列表项仍须 **`$ref` 具名 DTO**。 |
| **响应入口用包装 schema** | 分页接口的 `responses.200.content` 使用 **`Result_Paged_XxxDTO`**（或项目统一命名）一类 **`$ref`**，在 `components.schemas` 内层层 **`$ref`** 到列表项 DTO，避免仅在 path 下内联深层 object（部分工具/YApi 解析不稳定）。 |

导入后若仍缺字段：优先检查 OpenAPI 源文件是否违反上表；合并模式 **`mergeNoCheck`** 比 **`good`** 更利于用后端定义覆盖旧结构。

---

## 枚举字段规则（强制）

枚举字段（无论入参 DTO、出参 VO 还是 query 参数）的 `description` **必须列出对应枚举类的全部可选值**，禁止只写部分值。生成前需查阅对应 `*Enum.java` 源码确认全量枚举项。

### 整数枚举（存 code）

```json
"status": {
  "type": "integer",
  "enum": [0, 1, 2, 5],
  "description": "招聘状态：0.草稿 / 1.招聘中 / 2.待发布 / 5.已关闭",
  "example": 0,
  "mock": { "mock": 0 }
}
```

### 字符串枚举（存 desc）

```json
"recruitType": {
  "type": "string",
  "enum": ["社招", "校招", "实习"],
  "description": "招聘类型（存枚举 desc）：社招 / 校招 / 实习",
  "example": "社招",
  "mock": { "mock": "社招" }
}
```

### VO 中 code + desc 配对输出

```json
"statusCode": {
  "type": "integer",
  "enum": [0, 1, 2, 5],
  "description": "状态码：0.草稿 / 1.招聘中 / 2.待发布 / 5.已关闭",
  "example": 0,
  "mock": { "mock": 0 }
},
"statusDesc": {
  "type": "string",
  "enum": ["草稿", "招聘中", "待发布", "已关闭"],
  "description": "状态描述（与 statusCode 一一对应）：草稿 / 招聘中 / 待发布 / 已关闭",
  "example": "草稿",
  "mock": { "mock": "草稿" }
}
```

| 规则 | 要求 |
|------|------|
| **全量列举** | 禁止遗漏任何枚举值；需查阅 `*Enum.java` 源码确认 |
| **description 格式** | 整数枚举：`code.desc / code.desc`；字符串枚举：直接列 `desc / desc` |
| **example & mock** | 均取第一个合法枚举值（固定值，不用动态占位符） |
| **query 参数同等适用** | `parameters[in=query]` 的枚举字段同样必须全量说明 |

---

## 服务配置

> 服务地址等环境相关配置统一维护在各微服务的 `yapi-import.json` 中，不在本 skill 硬编码。

| 字段 | 来源 |
|------|------|
| 服务地址 | `yapi-import.json` 中的 `server` 字段 |
| 认证方式 | 项目 Token（从 YApi → 项目设置 → Token 配置获取），记录在 `yapi-import.json` 的 `token` 字段 |
| GET 请求 | Token 作为 query 参数 `?token={token}` |
| POST 请求 | Token 放入 JSON body `{"token": "..."}` |

---

## 支持的 API 操作

| API 路径 | 方法 | 说明 |
|----------|------|------|
| `/api/open/import_data` | POST | 导入接口数据（Swagger/OpenAPI） |
| `/api/open/run_auto_test` | GET | 运行自动化测试 |
| `/api/interface/add` | POST | 新增接口 |
| `/api/interface/save` | POST | 保存接口（覆盖） |
| `/api/interface/up` | POST | 更新接口 |
| `/api/interface/get` | GET | 获取单个接口详情 |
| `/api/interface/list` | GET | 获取接口列表 |
| `/api/interface/list_menu` | GET | 获取接口菜单（分类树） |
| `/api/interface/add_cat` | POST | 新增接口分类 |
| `/api/interface/getCatMenu` | GET | 获取所有分类 |

> 详细参数与响应结构见 [API_REFERENCE](references/API_REFERENCE.md)

---

## Python 调用工具函数

> 基础函数定义与各 API 调用示例见 [PYTHON_EXAMPLES.md](references/PYTHON_EXAMPLES.md)。

```python
# SERVER 从 yapi-import.json 的 server 字段读取
# yapi_get(path, params) / yapi_post(path, body)
# errcode == 0 为成功，否则查看 errmsg
```

---

## 同步后清理（强制）

YApi 同步流程中**仅为导入而生成**的文件，在**导入成功之后必须全部删除**，不得留在业务工程或提交到 Git。

| 类别 | 要求 |
|------|------|
| **主 OpenAPI 文件** | `yapi-import.json` 中 **`file`** 指向的文件（通常为 `yapi.json`）。`sync-yapi.sh` 在导入成功后 **`rm` 该文件**（见脚本末尾）。 |
| **mapping 临时工作区** | skill 流程固定使用 **`.yapi-tmp/`** 目录承载 LLM 生成的 `mapping.yaml` / `mapping/*.yaml`（详见 `references/MAPPING_SCHEMA.md`）。`sync-yapi.sh` 已**内置默认清理**该目录，**业务方无需在 `yapi-import.json` 声明**。 |
| **额外生成物（极少）** | 仅当本次任务在 `.yapi-tmp/` 之外另行产出非标产物（如临时脚本、备份副本等）时，才需要在 `yapi-import.json` 中配置可选字段 **`cleanup`**（字符串数组，相对项目根的路径），脚本成功导入后会**按序删除**（路径必须落在项目根下，防止误删）。**默认无需配置 `cleanup`**。 |
| **AI 执行约定** | mapping 一律落在 `.yapi-tmp/`，无需手工配置 cleanup；若不得不把生成物放在其他位置（包括 `/tmp`），任务结束前自行删除或写入 `cleanup`。 |
| **版本库** | 仅 **`yapi-import.json`**（及业务代码）纳入版本管理；所有导入用生成物须在 **`.gitignore`** 中覆盖常见名（如 `yapi.json`、`.yapi-tmp/` 等），避免误提交。 |

---

## 同步脚本快速调用

`sync-yapi.sh` 封装了完整同步流程（读取 `yapi-import.json` → POST 到 YApi → 删除 **`file`** 指定的 OpenAPI → 默认删除 **`.yapi-tmp/`** → 删除 **`cleanup`** 中额外列出的路径）：

```bash
# 传入业务工程根目录（含 yapi-import.json 和 AI 生成的 yapi.json）
bash ~/cursor/skills/java-yapi/scripts/sync-yapi.sh ~/IdeaProjects/hire
bash ~/cursor/skills/java-yapi/scripts/sync-yapi.sh ~/IdeaProjects/assess
```

> OpenAPI 由 AI 参照 [openapi3-template.json](references/openapi3-template.json) 生成；**同步成功后脚本会删除 `file`、默认清理 `.yapi-tmp/`，并删除 `cleanup` 所列额外路径**。`yapi-import.json` 纳入版本管理；生成物默认不入库，并建议 `.gitignore` 忽略 `yapi.json`、`.yapi-tmp/`。

---

## merge 策略说明

| 值 | YApi 界面名称 | 含义 | 适用场景 |
|----|--------------|------|----------|
| `normal` | 普通模式 | **跳过**已存在的接口，只导入新接口 | 只新增接口，不修改现有接口 |
| `good` | 智能合并 | 已存在的接口**合并** response 结构，保留手工改动 | 更新接口同时保留 YApi 手工备注 |
| `mergeNoCheck` | 完全覆盖 | 已存在的接口**完全替换**，不保留旧内容；**不删除旧接口** | 接口定义完全由后端决定 / **增量同步** |
| `fullReplace` | 脚本全量覆盖 | 先删除所有分类及接口，再重新导入 | 接口重构、路径变更、彻底清理（**日常全量重建推荐**） |

---

## 增量同步（仅更新部分接口）

适用：仅修改少量接口（如改 summary、补字段、加 1 个新接口），需保留 YApi 上其他接口与手工备注**不动**。

**三步操作**：

1. **临时切换 merge 策略**：把 `yapi-import.json` 中 `merge` 由 `fullReplace` 改为 `mergeNoCheck`（同 path 接口直接覆盖，**不删除**未列出的旧接口）。
2. **mapping 只放目标内容**：
   - `_meta.yaml` **必须有**（含 `service` 段，base_path 不变）
   - 仅保留含目标端点的 controller 分片；同一文件内可只列要改的端点
   - 端点引用的 schemas 与级联依赖必须在本次 mapping 内自洽（脚本会 fail-fast）
3. **常规执行**：`mapping-to-openapi.py` → `sync-yapi.sh`。同步成功后**改回** `merge: fullReplace`。

**安全要点**：

| 要点 | 说明 |
|------|------|
| 仅同 path + method 才覆盖 | 路径变化会被识别为「新增」，旧接口残留；改 path 应走 `fullReplace` |
| 不删除任何旧接口 | `mergeNoCheck` 与 `fullReplace` 的本质区别（详见 `sync-yapi.sh` 注释） |
| schemas 自洽 | 脚本对未声明的 ref 直接 fail-fast；不要依赖"复用上次 yapi.json 内的 schema" |
| **base_path 必须为空** | 若 YApi 项目已配置 `basepath`（如 `/api/v1/assess`），`_meta.yaml` 的 `base_path` **必须留空**；否则 `mergeNoCheck` 因路径不匹配会新建重复接口，而非覆盖原有接口。`check-yapi.sh [6]` 会自动阻断。 |
| 完成即复原 | 同步后立刻把 `merge` 改回 `fullReplace`，避免日常全量重建被误降级 |

**最小示例**（只改 1 个接口的 summary）：

```bash
# 1) 临时改 yapi-import.json 的 merge 字段为 "mergeNoCheck"
# 2) 写入仅含目标端点的最小 mapping
mkdir -p .yapi-tmp/mapping
cat > .yapi-tmp/mapping/_meta.yaml <<'YAML'
service:
  name: 评估服务
  base_path: ""      # ⚠ 若 YApi 项目已配置 basepath（如 /api/v1/assess），此处必须为空
  version: 1.0.0
YAML
cat > .yapi-tmp/mapping/paper.yaml <<'YAML'
schemas:
  OaRunStatusVO:
    description: OA 试题生成任务运行状态
    fields:
      - { name: runStatus, type: integer, description: '任务运行状态：1=生成中 / 2=成功 / 3=失败' }
groups:
  - name: OA 试卷
    endpoints:
      - path: /paper/oa-run-status/{jobId}
        method: GET
        summary: OA 试卷 - 生成任务状态查询（轮询）
        path_params:
          - { name: jobId, type: string, required: true, description: 职位 ID }
        response: OaRunStatusVO
YAML
# 3) 转换 + 同步（仅 1 端点）
python3 ~/.cursor/skills/java-yapi/scripts/mapping-to-openapi.py .yapi-tmp/mapping --output yapi.json
bash ~/.cursor/skills/java-yapi/scripts/sync-yapi.sh "$PWD"
# 4) 同步后把 yapi-import.json 的 merge 改回 "fullReplace"
```

---

## 审查清单

- [ ] **【YApi basepath 核查】** 同步前已通过 `/api/project/get?token=...` 确认 YApi 项目 `basepath`；**若项目已配置非空 basepath（如 `/api/v1/assess`），则 `_meta.yaml` 的 `base_path` 必须为空字符串（`""`）**，否则路径将出现双重前缀（如 `/api/v1/assess/api/v1/assess/...`）。`check-yapi.sh [6]` 会自动检测此冲突并阻断同步。
- [ ] `SERVER` 地址从 `yapi-import.json` 的 `server` 字段读取
- [ ] Token 来自对应微服务的 `yapi-import.json`，不硬编码在脚本中
- [ ] GET 请求 Token 在 query string，POST 请求 Token 在 JSON body
- [ ] 每次调用后检查 `errcode == 0`，失败时打印 `errmsg` 并退出
- [ ] **【分类名对齐】生成 `yapi.json` 前已调用 `getCatMenu` 获取现有分类列表，`tags[].name` 与现有分类名称字符串完全一致；确认全新功能时方可使用新名称**
- [ ] **【接口名格式】每个 `paths.*.*.summary` 均为 `业务名称 - 操作`（补充说明可放括号内），与上文「接口名称（summary）命名」一致**
- [ ] **【分类名格式】每个 `tags[*].name` / `groups[*].name` 是 4~12 字符的纯业务短语，不含 `Controller`/`Service`/`Manager`/`接口`/`服务`/`API` 等技术后缀；单字业务（`职位`/`题目`）已补足为 `职位管理`/`题目管理`（详见 [MAPPING_SCHEMA.md「name 命名」](references/MAPPING_SCHEMA.md)）**
- [ ] **【分页列表项】所有分页类响应中，列表数组的 `items` 均为具名 `$ref`，且对应 `components.schemas` 内 DTO 已声明完整 `properties`（见「分页与列表项 schema」）**
- [ ] **【枚举 enum 数组】所有枚举字段（parameters / DTO properties / VO properties）均已补充 `"enum": [...]`，数组值与 `*Enum.java` 中的 code 或 desc 全量对齐**
- [ ] **【mapping 命名】** `.yapi-tmp/` 下只存在 `mapping.yaml` 或 `mapping/` 目录（含 `_meta.yaml` + `<controller>.yaml`），**没有** `*-extra.yaml` / `*-merged.yaml` / `temp*.yaml` / 自写 `merge.py` / `combine.py` 等违规命名（详见 [MAPPING_SCHEMA.md「文件命名」](references/MAPPING_SCHEMA.md)）
- [ ] `fullReplace` 模式执行前已确认无需保留的手工注释
- [ ] **【增量同步】** 仅更新部分接口时：`yapi-import.json` 的 `merge` 已临时改为 `mergeNoCheck`，mapping 内所有 ref 在本次产物中自洽，**同步成功后已改回 `fullReplace`**（详见上文「增量同步」）
- [ ] **【同步后清理】** 导入成功后 `file` 与 `cleanup` 中路径已由脚本删除，或已手动删除本次产生的全部临时文件；工作区无仅用于 YApi 导入的残留物
- [ ] **【禁止缓存】** 本次 `yapi.json` 是在同步前重新读取 Controller / DTO / VO / Enum 等源码文件后生成的，**未复用**任何历史已生成 JSON 或对话记忆中的旧版内容

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [GENERATION_RULES.md](references/GENERATION_RULES.md) | AI 生成 yapi.json 的完整规则（路径截断、类型映射、Mock 速查表、required 规则） |
| [MAPPING_SCHEMA.md](references/MAPPING_SCHEMA.md) | **★ 中间 mapping YAML 格式规范（LLM 输出契约）** |
| [API_REFERENCE](references/API_REFERENCE.md) | YApi 所有开放 API 完整参数与响应结构 |
| [PYTHON_EXAMPLES.md](references/PYTHON_EXAMPLES.md) | Python 基础工具函数与各 API 调用示例 |
| [openapi3-template.json](references/openapi3-template.json) | OpenAPI 3.0 通用骨架模版（含全部端点模式与 Mock 规则） |
| [job-config-yapi.json](assets/job-config-yapi.json) | 真实业务案例（hire 职位配置，13 个接口完整示例） |
| [user-crud-yapi.json](assets/user-crud-yapi.json) | 通用 CRUD 示例（User，含 GET/POST/PATCH/DELETE、分页、枚举、Mock） |
| [yapi-import-example.json](assets/yapi-import-example.json) | `yapi-import.json` 配置模版（复制到业务工程根目录后替换 token） |
| [mapping-to-openapi.py](scripts/mapping-to-openapi.py) | **★ 将 mapping YAML 转为 OpenAPI 3.0 yapi.json（纯模板格式化）** |
| [sync-yapi.sh](scripts/sync-yapi.sh) | YApi 同步脚本（skill 内置，勿复制到业务工程，调用方式见下方） |
| [yapi-api.py](scripts/yapi-api.py) | YApi HTTP API 操作工具（获取接口列表/分类/新增分类/运行测试，依赖 yapi-import.json） |

---

## 标准同步流程（推荐按序执行）

> **重要架构变更**：旧的 `generate-openapi.py`（纯正则解析 Java 源码）已废弃。
> 新流程把"语义提取"职责交给 LLM（agent），脚本只做"无歧义的格式化"。

```text
Java 源码 ──(Agent 阅读 Controller/DTO/Enum，按 MAPPING_SCHEMA 输出)──▶ mapping.yaml
                                                                          │
                                            mapping-to-openapi.py (纯模板) ▼
                                                                       yapi.json
                                                                          │
                                                          sync-yapi.sh    ▼
                                                                       YApi
```

```bash
# Step 1. ★ Agent（你/AI）阅读业务工程的 Controller、DTO/VO、Enum 源码，
#         按 references/MAPPING_SCHEMA.md 规范产出 mapping YAML
#         必须现读源码，禁止复用历史对话/历史生成结果
#
#         ⚠ 文件命名严格遵守 MAPPING_SCHEMA.md「文件命名」章节，仅两种形态：
#           ① 单文件：<service-root>/.yapi-tmp/mapping.yaml
#           ② 分片  ：<service-root>/.yapi-tmp/mapping/_meta.yaml
#                     <service-root>/.yapi-tmp/mapping/<controller>.yaml
#         禁止 *-extra.yaml / *-merged.yaml / temp*.yaml / 自写 merge.py
#         使用 subagent 时，让其直接产出分片文件，不要返回半成品片段后再拼接

# Step 2. 把 mapping 转换成 OpenAPI 3.0 yapi.json（脚本同时支持单文件 / 目录入参）
python3 ~/.cursor/skills/java-yapi/scripts/mapping-to-openapi.py \
  <service-root>/.yapi-tmp/mapping.yaml \
  -o <service-root>/yapi.json
# 分片模式：
python3 ~/.cursor/skills/java-yapi/scripts/mapping-to-openapi.py \
  <service-root>/.yapi-tmp/mapping/ \
  -o <service-root>/yapi.json
# 示例：预览（只统计、不写文件）
python3 ~/.cursor/skills/java-yapi/scripts/mapping-to-openapi.py \
  ~/IdeaProjects/assess/.yapi-tmp/mapping/ --dry-run

# Step 3. 确认 YApi 已有分类（对齐 yapi.json 中的 tags[].name）
python3 ~/.cursor/skills/java-yapi/scripts/yapi-api.py \
  --config ./yapi-import.json list-categories

# Step 4. ★ 同步前校验（summary 格式 / 分页 $ref / mock 完整性）
bash ~/.cursor/skills/java-yapi/scripts/check-yapi.sh <service-root>

# Step 5. 同步接口到 YApi
bash ~/.cursor/skills/java-yapi/scripts/sync-yapi.sh <service-root>

# Step 6. 验证同步结果（接口数量与关键 summary/字段是否正确）
python3 ~/.cursor/skills/java-yapi/scripts/yapi-api.py \
  --config ./yapi-import.json list-interfaces

# Step 7. 清理 .yapi-tmp/ 与 yapi.json（sync-yapi.sh 会自动删除 yapi.json，
#         .yapi-tmp/ 可在 yapi-import.json 的 cleanup 字段配置）
```

---

## 其他 YApi 操作

```bash
# YA-03：新增接口分类（全新业务模块时使用）
python3 ~/cursor/skills/java-yapi/scripts/yapi-api.py \
  --config ./yapi-import.json add-category --name "招聘管理"

# YA-04：运行自动化测试（先查看用例集 ID，再指定运行）
python3 ~/cursor/skills/java-yapi/scripts/yapi-api.py \
  --config ./yapi-import.json run-tests --col-id <集合ID> --env-id <环境序号>
```

> `❌ [ERROR]` = 阻断，必须修复 | `🟡 [WARN]` = 警告 | `✅` = 通过
>
> 完整参考：[SCRIPTS_QUICK_REFERENCE.md](../SCRIPTS_QUICK_REFERENCE.md)
