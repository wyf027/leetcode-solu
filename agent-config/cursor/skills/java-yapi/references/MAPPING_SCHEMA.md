# YApi Mapping Schema（中间表示规范）

本文档定义"LLM 解析 Java 源码后输出的中间 mapping" 文件格式，
脚本 `scripts/mapping-to-openapi.py` 会按此格式解析并生成 OpenAPI 3.0 `yapi.json`。

> 设计原则：
> - **LLM 直出**：mapping 是 LLM 阅读 Java 源码后**直接编写的最终产物**，**禁止**用任何 Python 程序去"生成 mapping"（如 `gen_xxx_mapping.py`）；这种脚本会让字段语义被代码模板压平，必然退化为占位 schema
> - **简洁扁平**：避免 OpenAPI 多层嵌套
> - **schema 可复用**：DTO / VO / 嵌套静态类一律拍平到顶层 `schemas`，由名称引用
> - **真实展开**：每个 schema 的 `fields` 必须照 Java 源码逐字段写全，**禁止**空 `properties` 占位（`BizData` / `StubJson` / `CommonData` 之类）
> - **职责单一**：mapping 只描述语义与结构；mock / example 派生、Result 包装由脚本完成
> - **临时文件**：每次生成后删除，不入库

---

## 文件命名（强制）

mapping 文件**只允许**两种形态。脚本会主动拒绝其他命名（包括 `*-extra.yaml`、`*-merged.yaml`、`temp*.yaml`、`merge.py`、`combine.py`）。

### ① 单文件模式（小型项目，≤4 个 Controller）

```
<service-root>/.yapi-tmp/mapping.yaml
```

### ② 分片模式（推荐：5+ Controller 项目）

```
<service-root>/.yapi-tmp/mapping/
├── _meta.yaml                         # service 段 + 公共 enums + 公共 schemas（如 Paged 包装）
├── report-controller.yaml             # 每个 Controller 一个文件
├── question-controller.yaml
├── assessment-flow-controller.yaml
├── assessment-flow-internal.yaml
├── paper-controller.yaml
└── ...
```

**约束**：

| 项 | 规则 |
|---|---|
| 文件名 | `kebab-case.yaml`，与 Controller 名对应（`ReportController` → `report-controller.yaml`） |
| `service` 段 | **只在 `_meta.yaml` 出现一次**；其他分片省略 |
| `enums` / `schemas` | 跨分片**不允许重名**（脚本 fail-fast）；某 schema 仅一个分组用就放该分组的文件，多分组共用就放 `_meta.yaml` |
| `groups` | 每个分片一个或多个 group；group `name` 跨分片不允许重复 |
| 不允许 | 任何"片段拼接"产物（`-extra` / `-merged` / `temp*` / 自写 `merge.py`）—— 脚本本身已支持目录聚合，**禁止**在外部再造合并步骤 |

### 调用方式

```bash
# 单文件模式
python3 mapping-to-openapi.py <service-root>/.yapi-tmp/mapping.yaml \
    -o <service-root>/yapi.json

# 分片模式（直接传目录）
python3 mapping-to-openapi.py <service-root>/.yapi-tmp/mapping/ \
    -o <service-root>/yapi.json
```

### 子任务（subagent）协作约定

让 subagent 阅读多个 DTO/Controller 时：

- **必须**让其直接产出符合上述命名规范的分片文件（`<controller>.yaml` 或追加到 `_meta.yaml`）
- **禁止**让 subagent 输出"半成品片段"（如裸 `schemas` 列表）后再由主 agent / 临时脚本拼接

---

## 顶层结构

```yaml
service:        # 必填，服务元信息
  name: 评估服务
  base_path: ""          # ⚠ 见下方说明；若 YApi 项目已设 basepath，此处必须为空
  version: 1.0.0
  description: ...

enums: {}       # 可选，枚举集合（key = 枚举名）
schemas: {}     # 必填，DTO/VO/嵌套静态类集合（key = 类名）
groups: []      # 必填，接口分组（对应 Controller）
```

### `service.base_path` 规则（⚠ 重要）

`base_path` 是脚本拼接到每个 `endpoint.path` 前面生成最终 OpenAPI 路径的**唯一来源**。

| YApi 项目 `basepath` | `_meta.yaml base_path` | 结果 |
|---|---|---|
| 非空（如 `/api/v1/assess`） | **必须为 `""`（空）** | YApi 显示 `/assessment/flow/submit` ✅ |
| 非空（如 `/api/v1/assess`） | 与 basepath 相同 | YApi 显示 `/api/v1/assess/api/v1/assess/...` ❌ **双重前缀** |
| 空 | 任意 | `base_path` 原样拼接，自行保证不重叠 |

> **确认方式**：同步前执行 `GET /api/project/get?token=xxx` 查询 `data.basepath`。
> `check-yapi.sh [6]` 会自动检测此冲突并阻断（见脚本注释）。

---

## `enums`：枚举

```yaml
enums:
  AssessmentFlowStatusEnum:
    description: 评估流程状态
    type: integer            # integer | string
    storage: code            # code | desc，决定字段写 code 还是 description
    values:
      - { code: 1, label: 待开始 }
      - { code: 2, label: 进行中 }
      - { code: 3, label: 已完成 }
```

引用方式：在 `schema.fields[*]` 中用 `type: enum, enum: AssessmentFlowStatusEnum`。

**强制要求**：

| 项 | 规则 |
|---|---|
| **全量列举** | `values` 必须穷尽 `*Enum.java` 源码中的全部枚举项；禁止只写部分值 |
| **OpenAPI 输出** | `mapping-to-openapi.py` 会自动渲染 `"enum": [...]` 数组，并把 code/desc 拼接进字段 `description`（整数枚举：`code.desc / code.desc`；字符串枚举：直接列 `desc / desc`） |
| **VO 中 code + desc 配对** | 若 VO 同时输出 `xxxCode` + `xxxDesc`，两个字段都标 `type: enum, enum: XxxEnum`，由脚本分别生成 code 数组与 desc 数组 |
| **query 参数同等适用** | `query_params` 中的枚举字段同样用 `type: enum, enum: XxxEnum` |

---

## `schemas`：数据模型

每个顶层 key 是类名（与 Java 源码保持一致：`XxxDTO` / `XxxVO` / `XxxRequest` / 嵌套静态类）。

```yaml
schemas:
  AiRound1ReportDTO:
    description: AI 一面评测报告
    fields:
      - name: flowId
        type: string
        description: 评估流程 ID
        example: "1947283920182378496"          # 可选，若缺省脚本按 name+type 派生
      - name: questions
        type: array
        items: QuestionResult                   # 数组元素引用另一 schema
        description: 全部题目评分结果列表
      - name: pass
        type: boolean
        description: 是否通过本轮

  QuestionResult:                                # 嵌套静态类同样作为顶层 schema
    description: 单题评分结果
    fields:
      - name: questionId
        type: string
        description: 题目 ID
      - name: concept
        type: ref
        ref: AbilityDetail                      # 单对象引用
        description: 概念维度评测
      - name: status
        type: enum
        enum: AssessmentFlowStatusEnum          # 枚举引用
        description: 评测状态
```

### `field.type` 取值

| type | 说明 | 必填补充字段 |
|------|------|--------------|
| `string` | 字符串 | — |
| `integer` | 32 位整数 | — |
| `long` | 64 位整数（输出为 string） | — |
| `number` | 浮点 / BigDecimal | — |
| `boolean` | 布尔 | — |
| `datetime` | 日期时间 | — |
| `date` | 日期 | — |
| `array` | 数组 | `items`（基础类型字符串 或 schema 名） |
| `ref` | 单对象引用 | `ref`（schema 名） |
| `enum` | 枚举引用 | `enum`（enums 中的 key） |
| `object` | 自由对象（少用） | `fields`（同级嵌套） |
| `map` | Java `Map<String, V>` | `values`；key 集合有限时必须写 `keys` |

### `field` 其他属性

| 属性 | 说明 |
|------|------|
| `description` | 字段含义（必须填，禁止空） |
| `example` | 可选示例值 |
| `required` | 入参字段是否必填（true/false，默认 false） |
| `mock` | 可选自定义 mock，缺省时由脚本派生 |

### `Map<String, V>` 字段（YApi 展示友好）

Java 中的 `Map<String, V>` 用 `type: map` 表达，`values` 描述 value 类型。

**强制规则**：若 Map 的 key 取值是有限业务枚举（如题型分组 `choice / blank / game / code / bq`），必须写 `keys`，脚本会输出固定 `properties`，避免 YApi 页面把 `additionalProperties` 展示成空对象。

```yaml
schemas:
  AssessmentFlowJoinVO:
    description: 候选人进入评估响应
    fields:
      - name: questions
        type: map
        description: OA 试卷题目，按题型分组；AI 场景为 null
        keys:
          - { name: choice, description: 选择题列表 }
          - { name: blank,  description: 填空题列表 }
          - { name: game,   description: 游戏题列表 }
          - { name: code,   description: 代码题列表 }
          - { name: bq,     description: BQ 题列表 }
        values:
          type: array
          items: ApiQuestionVO
          description: 题目列表
```

只有真正开放 key 的字典才省略 `keys`，此时脚本输出 `additionalProperties`：

```yaml
- name: ext
  type: map
  description: 第三方扩展字段
  values: string
```

---

## `groups`：接口分组

### `name` 命名（强制）

`groups[*].name` 同时是 **OpenAPI `tags[*].name`** 和 **YApi 分类名**，由 `mapping-to-openapi.py` 在转换时强制校验。

| 项 | 规则 |
|---|---|
| 长度 | **去空格后 4~12 字符**（中英文混合可，含括号；推荐 4~8） |
| 内容 | 纯业务短语，与 Controller 资源语义一致 |
| 禁止结尾 | `Controller` / `controller` / `Service` / `service` / `Manager` / `manager` / `Api` / `API` / `接口` / `服务` / `管理器` |
| 单字业务名 | 必须**补足**为 4 字（`职位` → `职位管理`、`题目` → `题目管理`、`简历` → `简历管理`） |

不合规 → 合规对照（基于真实历史数据）：

| ❌ 之前 | ✅ 规范化 |
|---|---|
| 评估流程 Controller | 评估流程 |
| 评估流程内部接口 | 评估流程（内部） |
| 评测报告 Controller | 评测报告 |
| 试卷 Controller | OA 试卷 |
| 题目 Controller | 题目管理 |

```yaml
groups:
  - name: 评测报告                      # 分组名（= YApi 中的分类名 / OpenAPI tag）
    description: 提供 OA / AI 一面 / BQ / 候选人维度报告查询
    endpoints:
      - path: /report/ai/one/{candidateId}        # 不含 service.base_path，脚本自动拼接
        method: GET                                # GET | POST | PUT | DELETE | PATCH
        summary: 获取候选人最近一次 AI 一轮面试评测报告   # 必填
        description: ...                           # 可选
        path_params:
          - { name: candidateId, type: string, required: true, description: 候选人 ID }
        query_params: []                           # 可选
        request_body: null                         # 可选；指向 schema 名 或 inline 字段列表
        response: AiRound1ReportDTO                # 必填；指向 schema 名 或 'void'
```

### `summary` 命名（强制）

每个 endpoint 的 `summary` **必须**为 **`业务名称 - 操作`** 格式（与 SKILL.md「接口名称（summary）命名」保持一致）。`mapping-to-openapi.py` 在转换时会校验，违反直接 fail-fast。

| 项 | 规则 |
|---|---|
| 分隔符 | 半角 `空格 - 空格`（`" - "`），不能用全角破折号或缺空格 |
| 业务名称 | 领域对象/业务模块（如 `职位`、`评估流程`、`AI 一面报告`、`OA 试卷`、`题目`），与 group `name` 或 Controller 资源语义一致；可以是单字业务名（summary 内不强制 4 字）。**不得**以动词起头（`获取/查询/新增/创建/更新/删除/提交/触发/轮询/批量/统计/上传/下载/发布/关闭/启用/禁用/重置`） |
| 操作 | 动词短语（`新增`、`分页查询`、`详情查询`、`基本信息更新`、`状态更新`、`批量查询`、`PDF 下载链接查询`） |
| 补充说明 | 必要时放**操作后面的括号内**（`（最近一次）`、`（候选人维度）`、`（管理端）`），不破坏「业务 - 操作」主结构 |

不合规 → 合规对照：

| ❌ 当前措辞（Javadoc 风格） | ✅ 规范化后 |
|---|---|
| 获取候选人最近一次 AI 一轮面试评测报告 | AI 一面报告 - 详情查询（最近一次） |
| 分页查询评估流程列表 | 评估流程 - 分页查询 |
| 创建评估流程 | 评估流程 - 新增 |
| 候选人进入评估 | 评估流程 - 候选人进入 |
| 提交单道编程/算法题答案 | 评估流程 - 编程题答案提交 |
| 轮询代码试运行结果 | 评估流程 - 代码试运行结果查询 |
| 批量查询候选人 OA 评分摘要 | 评估流程（内部） - OA 评分批量查询 |
| 触发 OA 试题生成任务 | OA 试卷 - 生成任务触发 |
| 删除题目（逻辑删除） | 题目 - 删除 |
| 新增题目 | 题目 - 新增 |

> 写 mapping 时若直接照抄 Java 方法 Javadoc 文案（"获取/查询 XX 的 YY"），几乎一定违规——必须**主动转写**为「业务 - 操作」。

### `request_body` 形态

```yaml
# 形态 1：引用已有 schema
request_body: CreateXxxRequest

# 形态 2：inline 字段（少用）
request_body:
  name: AnonymousBody
  fields:
    - { name: foo, type: string, required: true, description: foo }
```

### `response` 形态

```yaml
response: AiRound1ReportDTO     # 引用 schema：脚本会自动套 Result<T>
response: void                  # 无返回（POST 类操作）
response:                       # array 形态
  type: array
  items: AssessmentFlowVO
```

### 分页响应（`Paged<T>`）

脚本不提供 `paged: true` 之类的语法糖；分页响应**在 `schemas` 中显式声明** `PagedXxxDTO`（与 `com.succaiss.commons.base.dto.Paged` 序列化一致），endpoint 用 `response: PagedXxxDTO` 引用：

```yaml
schemas:
  PagedAssessmentFlowItemDTO:
    description: 评估流程分页结果（Paged<AssessmentFlowItemDTO>）
    fields:
      - { name: records, type: array, items: AssessmentFlowItemDTO, description: 数据列表 }
      - { name: total,   type: long,    description: 总条数 }
      - { name: size,    type: long,    description: 每页条数 }
      - { name: current, type: long,    description: 当前页码 }
      - { name: pages,   type: long,    description: 总页数 }

  AssessmentFlowItemDTO:                    # 列表项 DTO，按 Java 类完整展开 fields
    description: 评估流程列表项
    fields: [ ... ]                         # 必须写全，禁止占位

groups:
  - name: 评估流程
    endpoints:
      - path: /flow/page
        method: GET
        summary: 评估流程 - 分页查询
        query_params:
          - { name: current, type: long, required: true, description: 当前页码 }
          - { name: size,    type: long, required: true, description: 每页条数 }
        response: PagedAssessmentFlowItemDTO
```

约束：

| 项 | 规则 |
|---|---|
| **列表项必须具名** | `records.items` 写 schema 名（`AssessmentFlowItemDTO`），不允许匿名 `object` |
| **列表项 DTO 写全 fields** | 列表项 DTO 必须按 Java 类完整声明 `fields`（避免 YApi 出现"有分页壳、无字段"） |
| **query 分页参数** | 固定用 `current / size`（可选 `sortField` / `sortOrder` / `lastId`），与 `Pageable` 一致 |
| **老接口兼容** | 个别老接口实际响应用 `list / pageNum / pageSize` 时，按真实响应写字段名即可，但列表项 DTO 仍须 `items: 具名DTO` 且 fields 写全 |

---

## Webhook 接口（异步回调契约）

业务方暴露给外部服务（如 AI 服务、第三方平台）的**异步回调**端点，调用方向与普通业务接口相反——**外部服务作为 client，业务方作为 server**。

> 典型反模式：把回调协议（caller / trigger / 字段表）整段塞到 endpoint 的 `description` 或 YApi「备注」里当文本，导致 YApi 上「啥都看不到」。**禁止**这样做。

### 写法约定

webhook 接口在结构上仍是普通 HTTP 端点（`path` / `method` / `request_body` / `response`），只需在 endpoint 上多加一个 `webhook` 字段，由 `mapping-to-openapi.py` 自动渲染为统一的 description 头部。

```yaml
groups:
  - name: Webhook 回调                         # 单独建分组，与业务接口隔离
    description: AI 服务异步回调业务方的接口契约
    endpoints:
      - path: /api/v1/exam-generate-svc/followup
        method: POST
        summary: 考试生成 - 跟进回调            # 仍走「业务 - 操作」格式，不写 [Webhook] 前缀
        webhook:
          caller: exam-generate-svc（AI 服务）  # 必填：哪个外部服务回调过来
          trigger: 异步出题任务完成时回调       # 必填：什么时候触发
          retry: 失败按指数退避，最多重试 5 次   # 可选：重试 / 幂等 / 鉴权约定
        request_body: ExamFollowupRequest      # 必填且按 schema 展开（见下方强制要求）
        response: ExamFollowupAck              # 业务方应返回的 schema；无返回写 void
```

### `webhook` 子字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `caller` | ✅ | 回调方服务名 / 来源（建议格式：`服务标识（中文说明）`） |
| `trigger` | ✅ | 触发时机（事件 / 任务节点描述） |
| `retry` | ⭕ | 重试 / 幂等 / 鉴权等附加约定 |

### 强制要求（`mapping-to-openapi.py` 在转换时 fail-fast）

| 项 | 规则 |
|---|---|
| **`caller` / `trigger` 必填** | 缺任一字段即报错；不允许空字符串 |
| **`request_body` 必填且具名** | webhook 端点必须声明 `request_body`，且必须指向 `schemas` 中**字段写全**的具名 DTO；禁止 inline 空 fields、禁止占位 schema（`EmptyPayload` / `BizData` 等） |
| **回调字段必须按源码展开** | 回调方有什么字段，`schemas` 里就写全什么字段；**禁止**把字段表用文本形式塞进 `description` |
| **summary 不变** | 仍为「业务名称 - 操作」，例如 `考试生成 - 跟进回调`；webhook 标识由脚本自动加到 description 顶部 |

### 转换后效果（YApi 接口详情）

```
⚠️ 本接口为 Webhook 回调

- 回调方：exam-generate-svc（AI 服务）
- 触发时机：异步出题任务完成时回调
- 重试策略：失败按指数退避，最多重试 5 次

<用户在 endpoint.description 里另写的业务说明（可选）>
```

请求参数 / 返回数据则按 `request_body` / `response` 引用的具名 schema 正常展示字段表与 Mock。

---

## 完整最小示例

```yaml
service:
  name: 评估服务
  base_path: ""          # ⚠ 评估服务 YApi 项目 basepath=/api/v1/assess，此处必须为空
  version: 1.0.0
  description: 评估服务（OA / AI 一面 / BQ / 综合报告）

enums:
  AssessmentFlowStatusEnum:
    description: 评估流程状态
    type: integer
    storage: code
    values:
      - { code: 1, label: 待开始 }
      - { code: 2, label: 进行中 }

schemas:
  ReportVO:
    description: 报告视图
    fields:
      - { name: flowId, type: string, description: 评估流程 ID, example: "194728..." }
      - { name: status, type: enum, enum: AssessmentFlowStatusEnum, description: 状态 }

groups:
  - name: 评测报告
    description: 报告查询
    endpoints:
      - path: /report/oa/{candidateId}
        method: GET
        summary: OA 报告 - 详情查询（最近一次）
        path_params:
          - { name: candidateId, type: string, required: true, description: 候选人 ID }
        response: ReportVO
```

---

## 注意事项

1. **嵌套静态类**：Java 内部 `public static class XxxDetail { ... }` 在 mapping 中**必须拆为顶层 schema**，由外层用 `ref: XxxDetail` 引用。这是为了消除歧义。
2. **description 不留空**：每个 field、endpoint、enum value 都要填 description；这是 mapping 的核心价值。
3. **example 可省**：脚本会按 name + type 派生（如 `phone` → `13800138000`，`email` → `user@example.com`）。
4. **summary 格式强制**：「业务名称 - 操作」由 `mapping-to-openapi.py` 转换时强制校验，违反即 fail-fast；不要寄希望于事后人工修正。
5. **public class 与 inner class 命名冲突**：mapping 用 Java 的 simpleName（如 `AbilityDetail`），如有冲突请重命名后再放入 schemas。

---

## 严禁（曾导致 YApi 文档大面积空壳的反模式）

| ❌ 反模式 | 后果 / 处置 |
|---|---|
| **用 Python 程序生成 mapping**（`gen_*_yapi_mapping.py` / `build_mapping.py` 等） | mapping 必须由 LLM 直出；任何"代码生成 mapping"几乎必然退化为占位 schema。**发现即删除该脚本**。 |
| **`BizData` / `StubJson` / `CommonData` 等空 `properties` 占位 schema** 被多个 endpoint 共用 | YApi 上 `data` 显示为 object + 一段说明，丢失字段级文档与 Mock。`mapping-to-openapi.py` 与 `check-yapi.sh` **会拒绝 `StubJson`**；`BizData` 等同类命名虽不在硬黑名单，**仍属违规**。 |
| **假字段 `_ref`** | 比"空"更误导（YApi 会真的展示一个名为 `_ref` 的字段）。脚本与 `check-yapi.sh` 已 fail-fast。 |
| **`fields: []` 的 schema 当 endpoint response** | 等价于占位；review 时直接打回。 |
| **同一 schema 被多个不相关 endpoint 共用** | 违反"端点-DTO 一一对应"，等价于通用占位。 |

> 上述底线由 `mapping-to-openapi.py` 与 `scripts/check-yapi.sh`（其中第 [6] 项 `禁止误导性占位 StubJson / properties._ref`）双重把关，但 LLM 在产出 mapping 时就应主动规避。
